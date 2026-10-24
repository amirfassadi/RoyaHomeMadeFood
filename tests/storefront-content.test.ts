import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contentDocumentSchema,contentEditSchema,defaultContentDocument,contentFields} from '../src/lib/storefront-content';

test('content defaults preserve both languages and every configured field has a default',()=>{
  const document=defaultContentDocument();
  assert(contentDocumentSchema.safeParse(document).success);
  assert.notEqual(document.content.fa.homeTitle1,document.content.en.homeTitle1);
  assert.deepEqual(contentFields.map(field=>field.key).sort(),Object.keys(document.content.fa).sort());
  document.content.fa.homeTitle1='changed';
  assert.notEqual(defaultContentDocument().content.fa.homeTitle1,'changed');
});
test('content edits validate both languages, length, version and unknown fields',()=>{
  const document=defaultContentDocument(),input={content:document.content,expectedUpdatedAt:document.updatedAt};
  for(const change of [{homeTitle1:''},{homeIntro:' '.repeat(10)},{aboutStory:'x'.repeat(4001)},{unknown:'field'}]){
    assert(!contentEditSchema.safeParse({...input,content:{...input.content,en:{...input.content.en,...change}}}).success);
  }
  assert(!contentEditSchema.safeParse({...input,expectedUpdatedAt:'invalid'}).success);
  assert(!contentEditSchema.safeParse({...input,role:'ADMIN'}).success);
  assert(!contentEditSchema.safeParse({...input,content:{...input.content,ar:input.content.en}}).success);
});
test('content is plain text: braces and markup are retained as literal characters, with outer whitespace trimmed',()=>{
  const document=defaultContentDocument();document.content.fa.aboutStory='  داستان {رویا}\n<script>alert(1)</script>  ';
  const parsed=contentEditSchema.parse({content:document.content,expectedUpdatedAt:document.updatedAt});
  assert.equal(parsed.content.fa.aboutStory,'داستان {رویا}\n<script>alert(1)</script>');
});
