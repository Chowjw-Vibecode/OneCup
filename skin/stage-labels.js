// Presentation-only labels. Never write translated names back into profiles.
const labels=[
 ['建立压力','Build pressure'],['保持流量','Hold flow'],['润湿','Wet the puck'],
 ['预浸泡','Preinfusion'],['预浸','Preinfusion'],['闷蒸','Bloom'],
 ['萃取','Extraction'],['降压','Pressure decline'],['结束','Finish'],
 ['无限制强制上升','Forced rise without limit'],['升压并维持','Rise and hold'],
];
export function stageLabel(name,language='zh') {
 const value=typeof name==='string'?name:'';
 const row=labels.find(([zh,en])=>value===zh||value.toLowerCase()===en.toLowerCase());
 return row ? row[language==='en'?1:0] : value;
}
