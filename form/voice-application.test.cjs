'use strict';
// Real inline model/parser/application function, with synthetic controls only.
// No browser, microphone, network, backend or real ledger is exercised here.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
function unique(predicate,label){const found=scripts.filter(predicate);assert.equal(found.length,1,label);return found[0];}
function setup(){
 const model=unique(s=>s.includes("schema: 'minimal-report-20261015'"),'current inline model');
 const parser=unique(s=>s.includes('function parseTranscript('),'current inline parser');
 const form=unique(s=>s.includes('function applyTranscript()'),'current application handler');
 assert(form.includes("$('voiceApply').addEventListener('click',applyTranscript)"),'actual button binding');
 const from='function applyTranscript(){',to='function clearErrors(){';
 assert.equal(form.split(from).length,2);assert.equal(form.split(to).length,2);
 const c=vm.createContext({window:{}});vm.runInContext(model,c);
 c.CdpReportForm=c.window.CdpReportForm;
 c.CdpReportForm.fields.find(f=>f.key==='reporterName').choices=['架空甲','架空乙','その他'];
 vm.runInContext(parser,c);c.CdpVoiceParser=c.window.CdpVoiceParser;
 const elements={};for(const f of c.CdpReportForm.fields)elements[f.key]={value:'',tagName:f.choices?'SELECT':'INPUT',maxLength:-1};
 for(const id of ['voiceTranscript','voiceResult','voiceStatus','reporterNameOther'])elements[id]={value:'',textContent:'',tagName:'INPUT',maxLength:-1};
 Object.assign(c,{elements});
 vm.runInContext("const $=id=>elements[id];const transcript=$('voiceTranscript');const manuallyChanged=new Set(),voiceFilled=new Set();let listening=false;function setStatus(t){$('voiceStatus').textContent=t;}function syncOtherReporterField(){}\n"+form.slice(form.indexOf(from),form.indexOf(to)),c);
 return {c,e:elements,manual(key,value){elements[key].value=value;vm.runInContext('manuallyChanged.add('+JSON.stringify(key)+')',c);},run(text){elements.voiceTranscript.value=text;vm.runInContext('applyTranscript()',c);assert.equal(elements.voiceTranscript.value,text,'raw transcript must be retained');}};
}
test('the current ten-field form and actual button handler are exercised',()=>{const x=setup();assert.equal(x.c.CdpReportForm.fields.length,10);assert.equal(x.e.summary,undefined);});
test('explicit company and timing are reflected from the current form parser',()=>{const x=setup();x.run('会社名 架空株式会社。希望時期 9月。');assert.equal(x.e.orgName.value,'架空株式会社');assert.equal(x.e.desiredTime.value,'9月');});
test('newlines and raw transcript text are retained',()=>{const x=setup(),text='会社名 架空株式会社\n希望時期 9月';x.run(text);assert.equal(x.e.orgName.value,'架空株式会社');});
test('a manually entered company survives another dictated company',()=>{const x=setup();x.manual('orgName','手入力会社');x.run('会社名 別の架空会社。希望時期 10月。');assert.equal(x.e.orgName.value,'手入力会社');assert.equal(x.e.desiredTime.value,'10月');});
test('an unknown department cannot replace a valid selected department',()=>{const x=setup();x.e.reporterDepartment.value='管理部';x.run('部署名 未登録部署。会社名 架空株式会社。');assert.equal(x.e.reporterDepartment.value,'管理部');assert.equal(x.e.orgName.value,'架空株式会社');});
test('the current reporter choices are taken from the runtime model',()=>{const x=setup();x.run('報告者 架空甲。部署名 管理部。');assert.equal(x.e.reporterName.value,'架空甲');assert.equal(x.e.reporterDepartment.value,'管理部');});
test('a manually selected reporter is preserved',()=>{const x=setup();x.manual('reporterName','架空甲');x.run('報告者 架空乙。会社名 架空株式会社。');assert.equal(x.e.reporterName.value,'架空甲');assert.equal(x.e.orgName.value,'架空株式会社');});
test('the manually supplied other-reporter name is preserved',()=>{const x=setup();x.e.reporterName.value='その他';x.manual('reporterNameOther','別の架空担当');x.run('報告者 架空乙。');assert.equal(x.e.reporterName.value,'その他');assert.equal(x.e.reporterNameOther.value,'別の架空担当');});
test('a manually edited case title is preserved',()=>{const x=setup();x.manual('caseTitle','手入力案件');x.run('案件名 音声案件。');assert.equal(x.e.caseTitle.value,'手入力案件');});
test('a manually selected case kind survives another valid dictated choice',()=>{const x=setup(),choices=x.c.CdpReportForm.fields.find(f=>f.key==='caseKind').choices;assert(choices.length>=2);const text='案件種別 '+choices[1]+'。';const fresh=setup();fresh.run(text);assert.equal(fresh.e.caseKind.value,choices[1]);x.manual('caseKind',choices[0]);x.run(text);assert.equal(x.e.caseKind.value,choices[0]);});
test('application is blocked during recognition',()=>{const x=setup();vm.runInContext('listening=true',x.c);x.run('会社名 架空株式会社。');assert.equal(x.e.orgName.value,'');assert.match(x.e.voiceStatus.textContent,/話し終え/);});
test('an untouched voice-filled company can be updated by a later application',()=>{const x=setup();x.run('会社名 第一架空株式会社。');x.run('会社名 第二架空株式会社。');assert.equal(x.e.orgName.value,'第二架空株式会社');});
test('a value exceeding the control limit is not silently truncated',()=>{const x=setup();x.e.orgName.maxLength=3;x.run('会社名 架空株式会社。');assert.equal(x.e.orgName.value,'');assert(x.e.voiceResult.textContent);});
test('retired fields are not reintroduced or inferred as a company',()=>{const x=setup();x.run('概要 架空の補足。');assert.equal(x.e.summary,undefined);assert.equal(x.e.orgName.value,'');});
