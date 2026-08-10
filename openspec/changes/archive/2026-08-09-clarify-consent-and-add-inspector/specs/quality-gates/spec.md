## ADDED Requirements

### Requirement: Real-model consent contract
Real-model evaluation SHALL reject autonomy vocabulary in Intent consent and SHALL verify an explicit notification request produces contract-valid Item and Automation declarations with the configured target.

#### Scenario: Model emits execute as consent
- **WHEN** model output contains `consent: execute`
- **THEN** schema validation fails and evaluation identifies the consent contract violation

#### Scenario: Notification declaration succeeds
- **WHEN** the configured target interprets an explicit scheduled notification request
- **THEN** Item and Automation declarations are applied without an invalid-response retry

#### Scenario: Malformed Automation envelope
- **WHEN** model output uses a string Trigger operator or omits required Intent-template fields
- **THEN** structured-output validation rejects it before publication

## REMOVED Requirements

### Requirement: Real-model authorization contract

**Reason**: Intent authorization was replaced by the explicit consent contract.

**Migration**: Evaluate `consent: none | explicit` and reject autonomy values in that field.
