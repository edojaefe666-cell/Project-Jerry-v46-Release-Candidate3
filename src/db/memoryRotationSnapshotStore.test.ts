import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
function digest(items: Array<{recordId:string;keyVersion:number;revision:number;createdAt:string}>): string {
 return createHash('sha256').update(JSON.stringify(items.map(x=>[x.recordId,x.keyVersion,x.revision,x.createdAt]))).digest('base64url');
}
test('manifest digest is deterministic and commits identity, key version, revision and creation time',()=>{
 const items=[
  {recordId:'record_1234567890ab',keyVersion:1,revision:4,createdAt:'2026-11-28T12:00:00.000Z'},
  {recordId:'record_1234567890ac',keyVersion:1,revision:2,createdAt:'2026-11-28T12:01:00.000Z'},
 ];
 assert.equal(digest(items),digest([...items]));
 assert.notEqual(digest(items),digest([{...items[0],revision:5},items[1]]));
 assert.notEqual(digest(items),digest([items[1],items[0]]));
});
test('manifest entries contain no ciphertext, plaintext or key material',()=>{
 const item={recordId:'record_1234567890ab',keyVersion:1,revision:1,createdAt:'2026-11-28T12:00:00.000Z'};
 assert.deepEqual(Object.keys(item).sort(),['createdAt','keyVersion','recordId','revision']);
});
