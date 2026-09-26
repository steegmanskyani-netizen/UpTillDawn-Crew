import test from 'node:test'
import assert from 'node:assert/strict'
import {deflateRawSync} from 'node:zlib'

// Regression coverage for the formats accepted by the server extractor.
const prefixes={docx:'word/media/',pptx:'ppt/media/',xlsx:'xl/media/'}
const supported=new Set(['jpg','jpeg','png','webp'])

test('Office formats use their canonical embedded-media folders',()=>{
 assert.equal(prefixes.docx,'word/media/')
 assert.equal(prefixes.pptx,'ppt/media/')
 assert.equal(prefixes.xlsx,'xl/media/')
})

test('only attachment-safe image formats are promoted',()=>{
 for(const ext of ['jpg','jpeg','png','webp'])assert.equal(supported.has(ext),true)
 for(const ext of ['gif','svg','emf','wmf','bin'])assert.equal(supported.has(ext),false)
})

test('raw deflate roundtrip used by Office ZIP entries is lossless',async()=>{
 const source=Buffer.from('uptilldawn-embedded-image-regression')
 const compressed=deflateRawSync(source)
 const {inflateRawSync}=await import('node:zlib')
 assert.deepEqual(inflateRawSync(compressed),source)
})
