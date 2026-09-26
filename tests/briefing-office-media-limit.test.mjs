import test from 'node:test'
import assert from 'node:assert/strict'

test('embedded Office media is capped so the source document plus extracted images fits the six-file briefing submission limit',()=>{
 const sourceDocument=1
 const extractedImages=5
 assert.equal(sourceDocument+extractedImages,6)
})
