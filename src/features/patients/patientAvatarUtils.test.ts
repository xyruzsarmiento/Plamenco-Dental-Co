import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getPatientAvatarInitials,
  getPatientAvatarName,
  getPatientProfileImage,
  resolvePatientAvatarSize,
} from './patientAvatarUtils.ts'

test('patient avatar initials come from first and last name', () => {
  assert.equal(getPatientAvatarInitials({ firstName: '  Ari', lastName: 'Lopez  ' }), 'AL')
  assert.equal(getPatientAvatarInitials({ firstName: '', lastName: 'Lopez' }), 'L')
  assert.equal(getPatientAvatarInitials({ firstName: '', lastName: '' }), '?')
})

test('patient avatar name prefers structured patient names', () => {
  assert.equal(getPatientAvatarName({ firstName: 'Ari', lastName: 'Lopez', fullName: 'Ignored Name' }), 'Ari Lopez')
  assert.equal(getPatientAvatarName({ firstName: '', lastName: '', fullName: 'Patient Record' }), 'Patient Record')
})

test('patient profile image must be a non-empty string', () => {
  assert.equal(getPatientProfileImage({ profileImage: '  data:image/png;base64,abc  ' }), 'data:image/png;base64,abc')
  assert.equal(getPatientProfileImage({ profileImage: '   ' }), '')
  assert.equal(getPatientProfileImage({}), '')
})

test('patient avatar sizes support presets and stable custom dimensions', () => {
  assert.equal(resolvePatientAvatarSize('compact'), 24)
  assert.equal(resolvePatientAvatarSize('small'), 32)
  assert.equal(resolvePatientAvatarSize('card'), 40)
  assert.equal(resolvePatientAvatarSize('identity'), 56)
  assert.equal(resolvePatientAvatarSize('large'), 64)
  assert.equal(resolvePatientAvatarSize('hero'), 88)
  assert.equal(resolvePatientAvatarSize(52.4), 52)
  assert.equal(resolvePatientAvatarSize(0), 40)
})
