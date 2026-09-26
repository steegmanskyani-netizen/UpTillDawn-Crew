import test from 'node:test'
import assert from 'node:assert/strict'
import {safePushEndpoint as appSafe} from '../lib/push-security.ts'
import {safeNotificationLink,safePushEndpoint as edgeSafe} from '../supabase/functions/push-notification/security.ts'

const validators=[appSafe,edgeSafe]

test('push endpoint validation accepts ordinary HTTPS provider hostnames',()=>{
  for(const validate of validators){
    assert.equal(validate('https://fcm.googleapis.com/fcm/send/example'),true)
    assert.equal(validate('https://updates.push.services.mozilla.com/wpush/v2/example'),true)
    assert.equal(validate('https://web.push.apple.com/Q/example'),true)
  }
})

test('push endpoint validation rejects URL credential and local/literal host bypasses',()=>{
  const invalid=[
    'http://fcm.googleapis.com/fcm/send/example',
    'https://user:pass@push.example.com/send',
    'https://localhost/push',
    'https://host.local/push',
    'https://host.internal/push',
    'https://host.home.arpa/push',
    'https://127.0.0.1/push',
    'https://2130706433/push',
    'https://0x7f000001/push',
    'https://0177.0.0.1/push',
    'https://10.0.0.1/push',
    'https://169.254.169.254/push',
    'https://192.168.1.2/push',
    'https://[::1]/push',
    'https://[::ffff:127.0.0.1]/push',
    'https://[::ffff:10.0.0.1]/push',
    'https://[::192.168.1.1]/push',
    'https://[fc00::1]/push',
    'https://[fe80::1]/push',
    'https://[ff02::1]/push',
  ]
  for(const validate of validators){
    for(const endpoint of invalid)assert.equal(validate(endpoint),false,endpoint)
  }
})

test('push notification links stay on a single-slash local app path',()=>{
  assert.equal(safeNotificationLink('/notifications'),'/notifications')
  assert.equal(safeNotificationLink('/tasks?id=1'),'/tasks?id=1')
  for(const value of ['https://evil.example','//evil.example','/\\evil.example',null,42]){
    assert.equal(safeNotificationLink(value),'/notifications')
  }
})
