import chalk from 'chalk'
import { ask, openUrl } from './lib/helpers.js'
import { setSystemEnv, readSlack, writeSlack } from '../lib/env.js'

const SERVICES = [
  {
    id: 'outlook',
    label: 'Microsoft Graph email access',
    description: 'Microsoft Graph email access',
    help: 'OAuth device-code flow for Microsoft Graph. Stores MS_CLIENT_ID, MS_TENANT_ID, and MS_REFRESH_TOKEN in state/secrets.json for local environment.',
    check: () => !!(process.env.MS_CLIENT_ID && process.env.MS_REFRESH_TOKEN),
    action: setupOutlook,
  },
  {
    id: 'notion',
    label: 'Notion task management',
    description: 'Notion integration token + root page',
    help: 'Captures NOTION_TOKEN (internal integration token) and NOTION_ROOT_PAGE_ID (parent page where task databases live). Both go into state/secrets.json for local environment.',
    check: () => !!(process.env.NOTION_TOKEN && process.env.NOTION_ROOT_PAGE_ID),
    action: setupNotion,
  },
  {
    id: 'slack',
    label: 'Slack webhook notifications',
    description: 'Slack webhook URLs per channel',
    help: 'Prompts for one Incoming Webhook URL per channel (#alerts, #logs, #general, etc). Stored in state/slack.json.',
    check: async () => {
      try {
        const slack = await readSlack()
        return !!(slack.logs && slack.news)
      } catch {
        return false
      }
    },
    action: setupSlack,
  },
  {
    id: 'schema',
    label: 'Notion database schema',
    description: 'Notion database schema',
    help: 'Discovers or creates the Notion databases (Projects, Tasks, Subtasks, Inbox) under NOTION_ROOT_PAGE_ID and syncs their schemas. Idempotent — safe to re-run.',
    check: async () => {
      try {
        const { loadDatabaseIds } = await import('../agents/tasks/database.ts')
        const ids = await loadDatabaseIds()
        return !!(ids.projects && ids.tasks && ids.subtasks && ids.inbox)
      } catch {
        return false
      }
    },
    deps: 'notion',
    action: setupSchema,
  },
]

async function showChecklist() {
  console.log(chalk.bold('\nWingman setup\n'))

  for (const service of SERVICES) {
    const ok = await service.check()
    const mark = ok ? chalk.green('✓') : chalk.gray('○')
    const label = ok ? service.label : chalk.gray(service.label)
    const dep = service.deps ? chalk.dim(` (requires: ${service.deps})`) : ''
    console.log(`  ${mark}  ${chalk.bold(service.id.padEnd(12))} ${label}${dep}`)
  }

  console.log(chalk.dim(`\nRun: wingman setup <id> to configure\n`))
}

async function setupOutlook() {
  console.log(chalk.bold('\n── Outlook / Microsoft Graph ──\n'))

  let clientId = process.env.MS_CLIENT_ID
  if (!clientId) {
    const url =
      'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade/quickStartType~/null/isMSAApp~/true'
    console.log('1. Register an app at Azure:')
    console.log(chalk.cyan(`   ${url}`))
    console.log(chalk.dim('   → Supported accounts: Personal Microsoft accounts'))
    console.log(
      chalk.dim(
        '   → Redirect URI: Mobile/desktop → https://login.microsoftonline.com/common/oauth2/nativeclient',
      ),
    )
    console.log(chalk.dim('   → Authentication → Enable "Allow public client flows"\n'))
    openUrl(url)
    clientId = await ask('Application (client) ID: ')
    if (!clientId) return console.log(chalk.yellow('Aborted.\n'))
    setSystemEnv('MS_CLIENT_ID', clientId)
  } else {
    console.log(chalk.green('✓'), 'Client ID:', chalk.dim(clientId))
  }

  let tenantId = process.env.MS_TENANT_ID || 'consumers'
  const newTenant = await ask(`Tenant ID [${tenantId}]: `)
  if (newTenant) tenantId = newTenant
  setSystemEnv('MS_TENANT_ID', tenantId)

  if (process.env.MS_REFRESH_TOKEN) {
    const redo = await ask('Refresh token already exists. Re-authenticate? [y/N]: ')
    if (redo.toLowerCase() !== 'y') {
      console.log(chalk.green('\n✓ Outlook configured.\n'))
      return
    }
  }

  console.log(chalk.bold('\nRunning OAuth device code flow...\n'))

  const { requestDeviceCode, pollForToken } = await import('../agents/email/auth.js')
  const codeRes = await requestDeviceCode()

  console.log(`  Open:  ${chalk.cyan(codeRes.verification_uri)}`)
  console.log(`  Code:  ${chalk.bold(codeRes.user_code)}\n`)
  openUrl(codeRes.verification_uri)

  console.log(chalk.dim('  Waiting for authentication...'))
  const tokenRes = await pollForToken(codeRes.device_code, codeRes.interval || 5)
  setSystemEnv('MS_REFRESH_TOKEN', tokenRes.refresh_token)

  console.log(chalk.green('\n✓ Outlook configured!\n'))
}

async function setupNotion() {
  console.log(chalk.bold('\n── Notion ──\n'))

  if (!process.env.NOTION_TOKEN) {
    const url = 'https://www.notion.so/profile/integrations'
    console.log('1. Create an internal integration:')
    console.log(chalk.cyan(`   ${url}`))
    console.log(chalk.dim('   → Type: Internal → Capabilities: Read/Update/Insert content\n'))
    openUrl(url)
    const token = await ask('Integration token (ntn_...): ')
    if (!token) return console.log(chalk.yellow('Aborted.\n'))
    setSystemEnv('NOTION_TOKEN', token)
  } else {
    console.log(chalk.green('✓'), 'Integration token configured')
  }

  if (!process.env.NOTION_ROOT_PAGE_ID) {
    console.log('\n2. Share a Notion page with the integration')
    console.log(chalk.dim('   Open a page → ··· → Connections → Add your integration'))
    console.log(chalk.dim('   Then copy the page URL or ID\n'))
    let pageId = await ask('Page ID or URL: ')
    if (!pageId) return console.log(chalk.yellow('Aborted.\n'))
    pageId = pageId.replace(/-/g, '')
    const match = pageId.match(/([a-f0-9]{32})/)
    if (match) pageId = match[1]
    setSystemEnv('NOTION_ROOT_PAGE_ID', pageId)
  } else {
    console.log(chalk.green('✓'), 'Root page ID:', chalk.dim(process.env.NOTION_ROOT_PAGE_ID))
  }

  console.log(chalk.green('\n✓ Notion configured!\n'))
}

async function setupSlack() {
  console.log(chalk.bold('\n── Slack Webhooks ──\n'))

  const url = 'https://api.slack.com/apps'
  console.log('1. Create a Slack app (or use an existing one):')
  console.log(chalk.cyan(`   ${url}`))
  console.log(chalk.dim('   → Features → Incoming Webhooks → Activate'))
  console.log(chalk.dim('   → Add New Webhook to Workspace for each channel\n'))
  openUrl(url)

  const slack = await readSlack()
  const webhooks = [
    { key: 'email_important', channel: '#email-important' },
    { key: 'email_digest', channel: '#email-digest' },
    { key: 'news', channel: '#news-digest' },
    { key: 'logs', channel: '#agent-logs' },
    { key: 'alerts', channel: '#agent-logs (alerts)' },
  ]

  for (const wh of webhooks) {
    if (slack[wh.key]) {
      console.log(chalk.green('✓'), wh.channel)
    } else {
      const hookUrl = await ask(`Webhook URL for ${wh.channel}: `)
      if (hookUrl) await writeSlack(wh.key, hookUrl)
      else console.log(chalk.dim('  skipped'))
    }
  }

  console.log(chalk.green('\n✓ Slack configured!\n'))
}

async function setupSchema() {
  const { initialize } = await import('../agents/tasks/database.ts')
  const ids = await initialize()
  console.log(chalk.green('\n✓ Notion databases ready!\n'))
  for (const [key, id] of Object.entries(ids)) {
    console.log(`  ${key.padEnd(12)} ${chalk.dim(id)}`)
  }
  console.log('')
}

export function register(program) {
  const cmd = program
    .command('setup')
    .description('Guided configuration for credentials and Notion schema')

  for (const service of SERVICES) {
    cmd
      .command(service.id)
      .description(service.description)
      .addHelpText('after', `\n${service.help}\n`)
      .action(service.action)
  }

  cmd.action(showChecklist)
}
