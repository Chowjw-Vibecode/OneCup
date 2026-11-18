import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileIntroModel, profileIntroMarkup } from '../profile-intro.js';
import { profileLibraryData } from '../profile-library-data.js';

test('首页中文介绍使用曲线库，实际标题和当前配方数值保留', () => {
  const profile = { ...profileLibraryData['Adaptive v3'].referenceProfile, title: 'Adaptive v3', notes: 'This profile aims to unite the best practices.' };
  const workflow = { profile, context: { targetDoseWeight: 18, targetYield: 36 } };
  const intro = profileIntroModel(workflow, 'zh');
  assert.equal(intro.title, 'Adaptive v3');
  assert.equal(intro.description, profileLibraryData['Adaptive v3'].guide.summary);
  assert.deepEqual([intro.dose, intro.target, intro.ratio], [18, 36, 2]);
  assert.equal(intro.originalNotes, profile.notes);
  const markup = profileIntroMarkup(workflow, 'zh');
  assert(!markup.split('prototype-intro-targets')[0].includes(profile.notes));
  assert(markup.includes('配方原始备注'));
  assert.equal(profileIntroModel(workflow, 'en').description, profile.notes);
});

test('HyperEx 2.1 的四段适配和未知导入方案都有中文显示', () => {
  const steps = ['flow', 'pressure', 'flow', 'flow'].map(pump => ({ pump, seconds: 6 }));
  const notes = 'Saved profile notes.';
  assert.match(profileIntroModel({profile:{title:'HyperEx 2.1', steps, notes}},'zh').description,/泄压暂停/);
  const unknown = profileIntroModel({profile:{title:'Custom profile', steps, notes}},'zh');
  assert.match(unknown.description,/4 个阶段/);
  assert.equal(unknown.originalNotes, notes);
  assert.equal(profileIntroModel({profile:{title:'自定义', notes:'保留中文说明。'}},'zh').description,'保留中文说明。');
});
