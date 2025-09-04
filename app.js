// app.js — Exam Coach upgrade
// Data saved in localStorage keys: exams, reminders, flashcards, user, posts

/* =========================
   Utils & Data helpers
   ========================= */
const LS = {
  exams: 'ec_exams_v2',
  reminders: 'ec_reminders_v2',
  flashcards: 'ec_flashcards_v1',
  user: 'ec_user_v2',
  posts: 'ec_posts_v1'
};

function load(key, defaultVal) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultVal;
  } catch (e) {
    return defaultVal;
  }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

let exams = load(LS.exams, []);        // {id, subject, date, content, intensity, plan: [{when,focus,done,postponed,notified}]}
let reminders = load(LS.reminders, []); // {id,title,datetime,message,voiceText,voiceName,notified,postponed}
let flashcards = load(LS.flashcards, []); // [{id,subject,topic,cards:[{q,a,id}]}]
let user = load(LS.user, { points: 0, badges: [], mood: null, preferredStudyHour: 19 });
let posts = load(LS.posts, []); // {id,title,body,comments:[]}

const PAGE_IDS = {
  dashboard: 'dashboardPage',
  today: 'todayPage',
  addExam: 'addExamPage',
  planner: 'plannerPage',
  micro: 'micro',
  quiz: 'quizPage',
  tutor: 'tutorPage',
  reminders: 'reminders',
  focus: 'focus',
  ar: 'arPage',
  community: 'community'
};

/* =========================
   Page switching & init
   ========================= */
function showPage(pageKey) {
  const allIds = Object.values(PAGE_IDS);
  allIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  const target = document.getElementById(PAGE_IDS[pageKey] || pageKey);
  if (target) target.classList.remove('hidden');

  // lazy renders
  if (pageKey === 'dashboard') renderDashboard();
  if (pageKey === 'today') showToday();
  if (pageKey === 'planner') renderPlanner();
  if (pageKey === 'micro') renderFlashcardStats();
  if (pageKey === 'quiz') loadQuizSubjectsAndTopics();
  if (pageKey === 'reminders') renderReminders();
  if (pageKey === 'community') renderPosts();
}
window.showPage = showPage;

// initial show
document.addEventListener('DOMContentLoaded', () => {
  // theme
  const themeBtn = document.getElementById('themeToggle');
  if (localStorage.getItem('ec_theme') === 'dark') {
    document.documentElement.classList.add('dark');
  }
  if (themeBtn) themeBtn.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('ec_theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  });

  // init voice options for reminders
  initVoices();

  // init selects
  initGradeSelect();

  // wire forms
  const examForm = document.getElementById('examForm');
  if (examForm) examForm.addEventListener('submit', onAddExam);

  const reminderForm = document.getElementById('reminderForm');
  if (reminderForm) reminderForm.addEventListener('submit', onAddReminder);

  const postForm = document.getElementById('postForm');
  if (postForm) postForm.addEventListener('submit', onAddPost);

  // start periodic reminder checker
  startReminderChecker();

  // render initial dashboard
  showPage('dashboard');

  // points/badges display
  updateUserUI();
});

/* =========================
   Dashboard / Summary
   ========================= */
function computeProgress() {
  let total = 0, done = 0;
  exams.forEach(e => {
    if (e.plan && e.plan.length) {
      total += e.plan.length;
      done += e.plan.filter(p => p.done).length;
    }
  });
  const percent = total ? Math.round((done/total)*100) : 0;
  return { total, done, percent };
}

function renderDashboard() {
  // progress bar
  const pb = document.getElementById('progressBar');
  const { percent } = computeProgress();
  if (pb) {
    pb.style.width = percent + '%';
    pb.textContent = percent + '%';
  }

  // summary cards
  const sc = document.getElementById('summaryCards');
  if (sc) {
    sc.innerHTML = '';
    const totalExams = exams.length;
    const upcoming7 = exams.filter(e => {
      const d = new Date(e.date);
      const today = new Date(); today.setHours(0,0,0,0);
      const max = new Date(); max.setHours(0,0,0,0); max.setDate(max.getDate()+7);
      return d >= today && d <= max;
    }).length;
    const points = user.points || 0;
    const cards = [
      {title:'Total exams', val: totalExams, icon:'📝'},
      {title:'Next 7 days', val: upcoming7, icon:'📅'},
      {title:'Points', val: points, icon:'⭐'}
    ];
    cards.forEach(c => {
      const node = document.createElement('div');
      node.className = 'bg-gray-50 p-4 rounded border';
      node.innerHTML = `<div class="text-sm text-gray-500">${c.icon} ${c.title}</div><div class="text-2xl font-bold">${c.val}</div>`;
      sc.appendChild(node);
    });
  }

  // weekly plan
  renderWeeklyPlan();
}

function renderWeeklyPlan() {
  const wk = document.getElementById('weeklyPlan');
  if (!wk) return;
  wk.innerHTML = '';
  const today = new Date(); today.setHours(0,0,0,0);
  for (let i=0;i<7;i++) {
    const day = new Date(today); day.setDate(today.getDate()+i);
    const dayStr = day.toDateString();
    const card = document.createElement('div');
    card.className = 'bg-white p-4 rounded shadow';
    const formatted = day.toLocaleDateString('th-TH', {weekday:'long', day:'numeric', month:'short'});
    card.innerHTML = `<div class="font-semibold mb-2">📅 ${formatted}</div>`;
    let tasks = [];
    exams.forEach(ex => {
      (ex.plan||[]).forEach(p => {
        if (new Date(p.when).toDateString() === dayStr) tasks.push({ex, p});
      });
    });
    if (!tasks.length) {
      card.innerHTML += '<div class="text-gray-500">วันนี้ว่าง 🎉</div>';
    } else {
      tasks.forEach(t => {
        const examDate = new Date(t.ex.date);
        const diffDays = Math.round((examDate - day)/(1000*60*60*24));
        const urgent = (diffDays>=0 && diffDays<=2);
        const row = document.createElement('div');
        row.className = `p-2 rounded mb-2 ${urgent ? 'bg-red-50' : 'bg-gray-50'}`;
        row.innerHTML = `<div class="font-semibold">${t.ex.subject} • ${new Date(t.p.when).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
          <div class="text-sm text-gray-600">${t.p.focus} • ${t.p.done ? '✅' : '⏳'}</div>
          <div class="mt-1 flex gap-2 flex-wrap">
            <button class="btn-ghost" onclick="markDone(${t.ex.id}, '${t.p.when}')">Mark done</button>
            <button class="btn-ghost" onclick="snoozePlan(${t.ex.id}, '${t.p.when}')">Snooze</button>
          </div>`;
        card.appendChild(row);
      });
    }
    wk.appendChild(card);
  }
}

/* =========================
   Exams & Plan generator
   ========================= */
function onAddExam(ev) {
  ev.preventDefault();
  const subject = document.getElementById('subject').value.trim();
  const date = document.getElementById('date').value;
  const content = document.getElementById('content').value.trim();
  const intensity = document.getElementById('intensity').value;
  if (!subject || !date) return alert('กรอกชื่อวิชาและวันที่ด้วย');
  const id = Date.now();
  const plan = generatePlan(date,intensity);
  const newExam = { id, subject, date, content, intensity, plan };
  exams.push(newExam);
  saveLocalExams();
  awardPoints(10, 'Add exam');
  showPage('dashboard');
  document.getElementById('examForm').reset();
}

function generatePlan(date, intensity) {
  const counts = { low:2, medium:4, high:7 };
  const sessions = counts[intensity] || 3;
  const arr = [];
  for (let i=1;i<=sessions;i++) {
    const d = new Date(date);
    d.setDate(d.getDate() - (sessions - i + 1)); // schedule leading up to exam
    d.setHours(user.preferredStudyHour || 19,0,0,0);
    arr.push({ when: d.toISOString(), focus: `ทบทวนรอบ ${i}`, done:false, postponed:0, notified:false });
  }
  return arr;
}

/* =========================
   Today view & mark done
   ========================= */
function showToday() {
  const list = document.getElementById('todayList');
  list.innerHTML = '';
  const today = new Date().toDateString();
  let tasks = [];
  exams.forEach(ex => {
    (ex.plan||[]).forEach(p => {
      if (new Date(p.when).toDateString() === today) tasks.push({ex, p});
    });
  });
  if (!tasks.length) {
    list.innerHTML = '<div class="bg-white p-4 rounded shadow text-gray-600">🎉 วันนี้ไม่มีแผนติว</div>';
    return;
  }
  tasks.forEach(t => {
    const node = document.createElement('div');
    node.className = 'bg-white p-4 rounded shadow flex justify-between items-center';
    node.innerHTML = `<div><div class="font-semibold">${t.ex.subject}</div><div class="text-sm text-gray-600">${t.p.focus}</div></div>`;
    const controls = document.createElement('div');
    const doneBtn = document.createElement('button'); doneBtn.className='btn'; doneBtn.textContent='เสร็จแล้ว';
    doneBtn.onclick = ()=> { markDone(t.ex.id, t.p.when); };
    controls.appendChild(doneBtn);
    node.appendChild(controls);
    list.appendChild(node);
  });
}

function markDone(examId, when) {
  const exam = exams.find(e => e.id === examId);
  if (!exam) return;
  const plan = (exam.plan || []).find(p => new Date(p.when).getTime() === new Date(when).getTime());
  if (!plan) return;
  plan.done = true;
  saveLocalExams();
  awardPoints(5, 'Complete study session');
  showToday();
  renderDashboard();
}

/* snooze plan (delay the plan by 30 minutes default) */
function snoozePlan(examId, when) {
  const exam = exams.find(e => e.id===examId);
  if (!exam) return;
  const plan = exam.plan.find(p => new Date(p.when).getTime() === new Date(when).getTime());
  if (!plan) return;
  const old = new Date(plan.when);
  const newDate = new Date(old.getTime() + 30*60*1000); // +30 min
  plan.when = newDate.toISOString();
  plan.postponed = (plan.postponed||0) + 1;
  saveLocalExams();
  if (plan.postponed >= 3) {
    suggestBetterTime(exam, plan);
  }
  renderDashboard(); showToday();
}

/* AI adapt — heuristic: suggest preferred hour */
function suggestBetterTime(exam, plan) {
  const preferred = user.preferredStudyHour || 19;
  if (confirm(`ระบบสังเกตว่าเลื่อน "${plan.focus}" บ่อย แนะนำย้ายเวลาไป ${String(preferred).padStart(2,'0')}:00 ของวันเดียวกันไหม?`)) {
    const d = new Date(plan.when); d.setHours(preferred,0,0,0);
    plan.when = d.toISOString();
    plan.postponed = 0;
    saveLocalExams();
    alert('เปลี่ยนเวลาเรียบร้อยแล้ว');
  }
}

/* save exams wrapper */
function saveLocalExams() {
  save(LS.exams, exams);
}

/* =========================
   Flashcards / Microlearning
   ========================= */
function addFlashcard() {
  const subject = document.getElementById('fcSubject').value.trim();
  const topic = document.getElementById('fcTopic').value.trim();
  const q = document.getElementById('fcQ').value.trim();
  const a = document.getElementById('fcA').value.trim();
  if (!subject || !topic || !q || !a) return alert('กรอกข้อมูล flashcard ให้ครบ');
  let set = flashcards.find(f => f.subject===subject && f.topic===topic);
  if (!set) {
    set = { id: Date.now(), subject, topic, cards: [] };
    flashcards.push(set);
  }
  set.cards.push({ q, a, id: Date.now() });
  save(LS.flashcards, flashcards);
  document.getElementById('fcQ').value=''; document.getElementById('fcA').value='';
  renderFlashcardStats();
  alert('เพิ่ม flashcard เรียบร้อย');
}

function renderFlashcardStats() {
  const s = document.getElementById('fcStats');
  const totalSets = flashcards.length;
  const totalCards = flashcards.reduce((acc,f)=>acc+(f.cards?f.cards.length:0),0);
  s.innerHTML = `ชุด: ${totalSets} • การ์ด: ${totalCards}`;
}

/* Flashcard session */
function startFlashcardSession() {
  if (!flashcards.length) return alert('ยังไม่มี flashcards');
  const set = flashcards[0];
  const cards = [...set.cards].sort(()=>Math.random()-0.5);
  const container = document.createElement('div');
  container.className = 'bg-white p-4 rounded shadow';
  let index = 0;
  function showCard() {
    container.innerHTML = `<div class="text-lg font-bold mb-2">Q: ${cards[index].q}</div>
      <div id="fcAnswer" class="text-gray-700 mb-3 hidden">A: ${cards[index].a}</div>
      <div class="flex gap-2">
        <button class="btn" id="showBtn">โชว์คำตอบ</button>
        <button class="btn-ghost" id="nextBtn">ถัดไป</button>
        <button class="btn-ghost" id="closeBtn">ปิด</button>
      </div>`;
    container.querySelector('#showBtn').onclick = ()=>{ container.querySelector('#fcAnswer').classList.remove('hidden'); };
    container.querySelector('#nextBtn').onclick = ()=>{ index++; if (index>=cards.length) index=0; showCard(); };
    container.querySelector('#closeBtn').onclick = ()=>{ container.remove(); };
  }
  showCard();
  document.getElementById('micro').appendChild(container);
}

/* Short session timer */
let shortTimer = null;
function startShortSession() {
  const mins = parseInt(document.getElementById('sessionMinutes').value) || 5;
  const ms = mins*60*1000;
  const display = document.getElementById('sessionTimer');
  let end = Date.now()+ms;
  display.textContent = formatMins(ms);
  if (shortTimer) clearInterval(shortTimer);
  shortTimer = setInterval(()=> {
    const rem = end - Date.now();
    if (rem <= 0) {
      clearInterval(shortTimer);
      display.textContent = 'เสร็จแล้ว 🎉';
      awardPoints(3, 'Complete short session');
      return;
    }
    display.textContent = formatMins(rem);
  }, 500);
}
function stopShortSession() {
  if (shortTimer) clearInterval(shortTimer);
  document.getElementById('sessionTimer').textContent='';
}
function formatMins(ms) {
  const s = Math.ceil(ms/1000);
  const mm = Math.floor(s/60);
  const ss = s%60;
  return `${mm.toString().padStart(2,'0')}:${ss.toString().padStart(2,'0')}`;
}

/* =========================
   Quiz Mode (AI-gen)
   ========================= */
function initGradeSelect() {
  const sel = document.getElementById('quizGrade');
  if (!sel) return;
  const grades = ['ป.1','ป.2','ป.3','ป.4','ป.5','ป.6','ม.1','ม.2','ม.3','ม.4','ม.5','ม.6'];
  sel.innerHTML = grades.map(g=>`<option value="${g}">${g}</option>`).join('');
  loadQuizSubjectsAndTopics();
}
function loadQuizSubjectsAndTopics() {
  const gradeEl = document.getElementById('quizGrade');
  if (!gradeEl) return;
  const grade = gradeEl.value;
  const subjectSelect = document.getElementById('quizSubject');
  const topicSelect = document.getElementById('quizTopic');
  if (!subjectSelect || !topicSelect) return;
  const sample = {
    "ป.1":["คณิต","ภาษาไทย","อังกฤษ"],
    "ป.2":["คณิต","วิทย์","อังกฤษ"],
    "ม.4":["คณิต","อังกฤษ","วิทย์"],
    "ม.5":["คณิต","วิทย์","อังกฤษ"],
    "ม.6":["คณิต","อังกฤษ","ฟิสิกส์"]
  }[grade] || ['คณิต','อังกฤษ','วิทย์'];
  subjectSelect.innerHTML = sample.map(s=>`<option>${s}</option>`).join('');
  topicSelect.innerHTML = ['บท1','บท2','บท3','บท4'].map(t=>`<option>${t}</option>`).join('');
}
function generateAIQuestions(grade,subject,topic,difficulty,count) {
  const pool = ['A','B','C','D','1','2','3','4'];
  const questions = [];
  for (let i=0;i<count;i++){
    const opts = [];
    const nOpts = 4;
    for (let j=0;j<nOpts;j++) opts.push(pool[Math.floor(Math.random()*pool.length)]);
    const answer = opts[Math.floor(Math.random()*opts.length)];
    questions.push({
      q: `(${difficulty}) ${subject} บท ${topic} — ข้อ ${i+1}: เลือกคำตอบให้ถูก`,
      options: opts,
      answer
    });
  }
  return questions;
}
function startQuiz() {
  const grade = document.getElementById('quizGrade').value;
  const subject = document.getElementById('quizSubject').value;
  const topic = document.getElementById('quizTopic').value;
  const count = parseInt(document.getElementById('quizCount').value) || 5;
  const questions = generateAIQuestions(grade,subject,topic,'medium',count);
  const container = document.getElementById('quizContainer');
  container.innerHTML = '';
  let idx=0, score=0;
  function renderQ() {
    if (idx>=questions.length) {
      container.innerHTML = `<div class="bg-white p-4 rounded shadow">เสร็จ! คะแนน ${score}/${questions.length}</div>`;
      awardPoints(score*2, 'Quiz complete');
      return;
    }
    const q = questions[idx];
    const node = document.createElement('div');
    node.className = 'bg-white p-4 rounded shadow';
    node.innerHTML = `<div class="font-semibold mb-2">${q.q}</div>`;
    q.options.forEach(opt=>{
      const b = document.createElement('button');
      b.className = 'btn-ghost mr-2 mb-2';
      b.textContent = opt;
      b.onclick = ()=> {
        if (opt===q.answer) score++;
        idx++;
        renderQ();
      };
      node.appendChild(b);
    });
    container.innerHTML=''; container.appendChild(node);
  }
  renderQ();
}

/* =========================
   Reminders (check + notify)
   ========================= */
let reminderCheckerInterval = null;
function onAddReminder(ev) {
  ev.preventDefault();
  const title = document.getElementById('remTitle').value.trim();
  const dt = document.getElementById('remDatetime').value;
  const message = document.getElementById('remMessage').value.trim();
  const voiceText = document.getElementById('remVoice').value.trim();
  const voiceName = document.getElementById('remVoiceSelect').value;
  if (!title || !dt) return alert('กรอก title และเวลา');
  const id = Date.now();
  reminders.push({ id, title, datetime: dt, message, voiceText, voiceName, notified:false, postponed:0 });
  save(LS.reminders, reminders);
  renderReminders();
  document.getElementById('reminderForm').reset();
  alert('ตั้งการเตือนเรียบร้อย');
}

function renderReminders() {
  const list = document.getElementById('remindersList');
  list.innerHTML = '';
  reminders.sort((a,b)=>new Date(a.datetime)-new Date(b.datetime));
  reminders.forEach(r => {
    const node = document.createElement('div');
    node.className = 'bg-white p-3 rounded shadow flex justify-between items-center';
    node.innerHTML = `<div><div class="font-semibold">${r.title}</div><div class="text-sm text-gray-600">${r.datetime}</div><div class="text-sm">${r.message||''}</div></div>`;
    const controls = document.createElement('div');
    const del = document.createElement('button'); del.className='btn-ghost'; del.textContent='ลบ';
    del.onclick = ()=>{ reminders = reminders.filter(x=>x.id!==r.id); save(LS.reminders, reminders); renderReminders(); };
    const snoozeBtn = document.createElement('button'); snoozeBtn.className='btn-ghost'; snoozeBtn.textContent='Snooze 10m';
    snoozeBtn.onclick = ()=>{ snoozeReminder(r.id, 10); };
    const gbtn = document.createElement('button'); gbtn.className='btn-ghost'; gbtn.textContent='↗︎ Google';
    gbtn.onclick = ()=> quickAddGoogle(r);
    controls.appendChild(snoozeBtn); controls.appendChild(gbtn); controls.appendChild(del);
    node.appendChild(controls);
    list.appendChild(node);
  });
}

function snoozeReminder(id, minutes=10) {
  const r = reminders.find(x=>x.id===id); if(!r) return;
  const dt = new Date(r.datetime); dt.setMinutes(dt.getMinutes() + minutes);
  r.datetime = dt.toISOString().slice(0,16);
  r.postponed = (r.postponed||0)+1;
  save(LS.reminders, reminders);
  renderReminders();
  if (r.postponed >= 3) {
    if (confirm('ระบบสังเกตว่าเลื่อนบ่อย แนะนำเลื่อนเป็นตอนเย็น 19:00 ใช่ไหม?')) {
      dt.setHours(19); dt.setMinutes(0);
      r.datetime = dt.toISOString().slice(0,16);
      r.postponed = 0;
      save(LS.reminders, reminders);
      renderReminders();
    }
  }
}

function startReminderChecker() {
  if (reminderCheckerInterval) clearInterval(reminderCheckerInterval);
  reminderCheckerInterval = setInterval(checkReminders, 20*1000);
  checkReminders();
}
function checkReminders() {
  if ('Notification' in window && Notification.permission !== 'granted') {
    Notification.requestPermission().then(() => {});
  }
  const now = new Date();
  reminders.forEach(r => {
    const rdt = new Date(r.datetime);
    if (!r.notified && Math.abs(rdt - now) < 30*1000) {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(r.title, { body: r.message || 'Time to study!', tag: r.id });
      } else {
        alert(`Reminder: ${r.title}\n${r.message||''}`);
      }
      if (r.voiceText && 'speechSynthesis' in window) {
        const ut = new SpeechSynthesisUtterance(r.voiceText);
        const v = (speechSynthesis.getVoices() || []).find(v=>v.name===r.voiceName);
        if (v) ut.voice = v;
        speechSynthesis.speak(ut);
      }
      r.notified = true;
      save(LS.reminders, reminders);
      awardPoints(1, 'Reminder trigger');
    }
  });

  // also check exam plan events and notify if within next 30s and not done
  const nowISO = new Date();
  exams.forEach(ex => {
    (ex.plan||[]).forEach(p => {
      const pdt = new Date(p.when);
      if (!p.notified && Math.abs(pdt - nowISO) < 30*1000 && !p.done) {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`ติว: ${ex.subject}`, { body: p.focus, tag: `${ex.id}_${p.when}`});
        } else {
          if (confirm(`ถึงเวลาเรียน ${ex.subject} - ${p.focus}\nต้องการเริ่มตอนนี้หรือเลื่อนไหม?`)) {
            // start
          } else {
            p.when = new Date(pdt.getTime()+10*60*1000).toISOString();
            p.postponed = (p.postponed||0)+1;
            if (p.postponed >= 3) suggestBetterTime(ex,p);
          }
        }
        p.notified = true;
        saveLocalExams();
      }
    });
  });
}

/* Voices init & preview */
function initVoices() {
  const sel = document.getElementById('remVoiceSelect');
  function populate() {
    const voices = speechSynthesis.getVoices();
    if (!sel) return;
    sel.innerHTML = voices.map(v=>`<option value="${v.name}">${v.name} (${v.lang})</option>`).join('');
  }
  if ('speechSynthesis' in window) {
    populate();
    window.speechSynthesis.onvoiceschanged = populate;
  }
}
function previewVoice() {
  const text = (document.getElementById('remVoice').value || 'ถึงเวลาอ่านหนังสือแล้ว!').trim();
  const name = document.getElementById('remVoiceSelect').value;
  if (!('speechSynthesis' in window)) return alert('เบราว์เซอร์ไม่รองรับเสียง');
  const u = new SpeechSynthesisUtterance(text);
  const v = speechSynthesis.getVoices().find(v=>v.name===name);
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

/* =========================
   Focus / Pomodoro
   ========================= */
let pomInterval = null;
let pomRemaining = 0;
let pomMode = 'work';
function startPomodoro() {
  const work = parseInt(document.getElementById('pomWork').value) || 25;
  const br = parseInt(document.getElementById('pomBreak').value) || 5;
  pomRemaining = work*60;
  pomMode = 'work';
  renderPom();
  if (pomInterval) clearInterval(pomInterval);
  pomInterval = setInterval(()=> {
    pomRemaining--;
    if (pomRemaining<=0) {
      if (pomMode === 'work') {
        pomMode = 'break';
        pomRemaining = br*60;
        awardPoints(2, 'Pomodoro complete');
        if ('Notification' in window && Notification.permission==='granted') new Notification('Pomodoro','พักได้แล้ว');
      } else {
        pomMode = 'work';
        pomRemaining = work*60;
      }
    }
    renderPom();
  }, 1000);
}
function stopPomodoro() {
  if (pomInterval) { clearInterval(pomInterval); pomInterval = null; }
  document.getElementById('pomTimer').textContent = '';
}
function renderPom() {
  const el = document.getElementById('pomTimer');
  const mm = Math.floor(pomRemaining/60).toString().padStart(2,'0');
  const ss = (pomRemaining%60).toString().padStart(2,'0');
  el.textContent = `${pomMode.toUpperCase()} ${mm}:${ss}`;
}
function toggleFocusMode() {
  if (document.getElementById('focusOverlay')) {
    document.getElementById('focusOverlay').remove();
    return;
  }
  const ov = document.createElement('div');
  ov.id = 'focusOverlay'; ov.innerHTML = `<div><h2 class="text-2xl">🛡️ Focus Mode</h2><p>ปิดแจ้งเตือนชั่วคราว</p><button class="btn mt-4" onclick="toggleFocusMode()">ออกจาก Focus</button></div>`;
  document.body.appendChild(ov);
}

/* =========================
   Gamification (points, badges)
   ========================= */
function awardPoints(n, reason) {
  user.points = (user.points||0) + n;
  if (user.points >= 50 && !user.badges.includes('Starter')) user.badges.push('Starter');
  if (user.points >= 200 && !user.badges.includes('Pro Student')) user.badges.push('Pro Student');
  save(LS.user, user); updateUserUI();
}
function updateUserUI() {
  const p = document.getElementById('pointsDisplay');
  const b = document.getElementById('badgesDisplay');
  if (p) p.textContent = user.points || 0;
  if (b) b.textContent = (user.badges||[]).length;
}

/* =========================
   AI Tutor (template-based, step-by-step)
   ========================= */
function aiSummarize(text) {
  const sents = text.split(/[.?!]\s|[\n\r]/).filter(Boolean);
  const sum = sents.slice(0,2).join('. ') + (sents.length>2 ? '...' : '');
  return `สรุปสั้น ๆ:\n- ${sum}`;
}
function aiSolveEquation(expr) {
  // extremely simplified: handles pattern ax+b=c -> solve for x
  const m = expr.replace(/\s+/g,'').match(/^(-?\d*)x([+\-]\d+)?=(\-?\d+)$/i);
  if (!m) return 'ยังไม่รองรับรูปแบบสมการนี้ แต่แนวคิดคือ: ย้ายข้าง, รวมพจน์ x, แล้วหารสัมประสิทธิ์';
  const a = m[1]===''||m[1]==='-'? (m[1]==='-'?-1:1) : parseInt(m[1],10);
  const b = m[2]? parseInt(m[2],10) : 0;
  const c = parseInt(m[3],10);
  const steps = [
    `เริ่มจาก ${a}x ${b>=0?'+':''}${b} = ${c}`,
    `ย้าย ${b} ไปอีกข้าง: ${a}x = ${c - b}`,
    `หารทั้งสองข้างด้วย ${a}: x = ${(c - b)/a}`
  ];
  return steps.map((s,i)=>`${i+1}. ${s}`).join('\n');
}
function aiTutorAnswer(q) {
  const lower = q.toLowerCase();
  if (lower.includes('สรุป')) return aiSummarize(q.replace(/สรุป|สรุปให้หน่อย/gi,''));
  if (lower.includes('แก้สมการ') || lower.match(/[=].*x|x.*=/)) {
    const cleaned = q.replace(/แก้สมการ|หา x|หาค่า x|หาค่าx/gi,'').trim();
    return aiSolveEquation(cleaned || '2x+3=11');
  }
  // default step explanation template
  return [
    'แนวทางเป็นขั้นตอน:',
    '1) แตกหัวข้อหลักเป็นประเด็นย่อย',
    '2) ยกตัวอย่างง่าย ๆ',
    '3) เช็คความเข้าใจด้วยคำถามสั้น',
    '4) สรุปประเด็นสำคัญ 3 ข้อ'
  ].join('\n');
}
window.runTutor = function() {
  const inp = document.getElementById('tutorInput');
  const out = document.getElementById('tutorOutput');
  const q = (inp.value||'สรุป การอนุรักษ์พลังงาน คืออะไร').trim();
  const ans = aiTutorAnswer(q);
  out.innerHTML = `<pre class="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded">${ans}</pre>`;
};

/* =========================
   Community posts (local)
   ========================= */
function onAddPost(ev) {
  ev.preventDefault();
  const title = document.getElementById('postTitle').value.trim();
  const body = document.getElementById('postBody').value.trim();
  if (!title || !body) return alert('กรอกหัวข้อและรายละเอียด');
  const post = { id: Date.now(), title, body, comments: [] };
  posts.unshift(post);
  save(LS.posts, posts);
  renderPosts();
  document.getElementById('postForm').reset();
}
function renderPosts() {
  const el = document.getElementById('postsList');
  el.innerHTML = '';
  posts.forEach(p => {
    const node = document.createElement('div');
    node.className = 'bg-white p-3 rounded shadow';
    node.innerHTML = `<div class="font-semibold">${p.title}</div><div class="text-sm text-gray-700 mb-2">${p.body}</div>`;
    const commentBtn = document.createElement('button'); commentBtn.className='btn-ghost'; commentBtn.textContent='ตอบ';
    commentBtn.onclick = ()=> {
      const c = prompt('ตอบ (ข้อความ):');
      if (c) {
        p.comments.push({id:Date.now(), text:c});
        save(LS.posts, posts); renderPosts();
      }
    };
    node.appendChild(commentBtn);
    if (p.comments && p.comments.length) {
      const comList = document.createElement('div'); comList.className='mt-2 text-sm text-gray-600';
      p.comments.forEach(c => comList.innerHTML += `<div class="mb-1">- ${c.text}</div>`);
      node.appendChild(comList);
    }
    el.appendChild(node);
  });
}

/* =========================
   Planner (manage exams)
   ========================= */
function renderPlanner() {
  const el = document.getElementById('plannerList');
  el.innerHTML = '';
  if (!exams.length) {
    el.innerHTML = '<div class="bg-white p-4 rounded shadow text-gray-600">ยังไม่มีวิชาสอบ เพิ่มได้ที่ "Add Exam"</div>';
    return;
  }
  exams.sort((a,b)=> new Date(a.date) - new Date(b.date));
  exams.forEach(e => {
    const wrap = document.createElement('div');
    wrap.className = 'bg-white p-4 rounded shadow';
    const dateStr = new Date(e.date + 'T00:00:00').toLocaleDateString('th-TH',{weekday:'short', day:'2-digit', month:'short'});
    let planHtml = '';
    (e.plan||[]).forEach(p => {
      planHtml += `<div class="flex items-center justify-between bg-gray-50 rounded px-2 py-1 mb-1">
        <div class="text-sm">${new Date(p.when).toLocaleString([], {weekday:'short',hour:'2-digit',minute:'2-digit', day:'2-digit', month:'short'})} — ${p.focus} ${p.done?'✅':''}</div>
        <div class="flex gap-1">
          <button class="btn-ghost text-xs" onclick="markDone(${e.id}, '${p.when}')">Done</button>
          <button class="btn-ghost text-xs" onclick="snoozePlan(${e.id}, '${p.when}')">+30m</button>
        </div>
      </div>`;
    });
    wrap.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <div class="font-semibold">${e.subject}</div>
          <div class="text-xs text-gray-600">สอบ: ${dateStr}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn-ghost" onclick="openGoogleForExam(${e.id})">↗︎ Google Calendar</button>
          <button class="btn-ghost" onclick="deleteExam(${e.id})">ลบ</button>
        </div>
      </div>
      <div class="mt-2">${planHtml || '<div class="text-sm text-gray-500">ยังไม่มีแผน</div>'}</div>
    `;
    el.appendChild(wrap);
  });
}
function deleteExam(id) {
  if (!confirm('ลบรายการนี้?')) return;
  exams = exams.filter(e=>e.id!==id);
  saveLocalExams();
  renderPlanner(); renderDashboard();
}

/* =========================
   Calendar export / Google quick add
   ========================= */
function exportCalendar() {
  let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//ExamCoach//EN\n';
  exams.forEach(e => {
    const dt = new Date(e.date);
    const dtstart = dt.toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
    const uid = `${e.id}@examcoach.local`;
    const desc = (e.content||'').replace(/\n/g,'\\n');
    ics += `BEGIN:VEVENT\nUID:${uid}\nDTSTAMP:${(new Date()).toISOString().replace(/[-:]/g,'').split('.')[0]}Z\nDTSTART:${dtstart}\nSUMMARY:${e.subject}\nDESCRIPTION:${desc}\nEND:VEVENT\n`;
  });
  ics += 'END:VCALENDAR';
  const blob = new Blob([ics], {type:'text/calendar'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'examcoach_calendar.ics'; document.body.appendChild(a); a.click(); a.remove();
}

function openGoogleForExam(id) {
  const e = exams.find(x=>x.id===id);
  if (!e) return;
  const start = new Date(e.date);
  const end = new Date(start.getTime() + 60*60*1000);
  const fmt = d => d.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Exam: '+e.subject)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(e.content||'')}`;
  window.open(url, '_blank');
}
function quickAddGoogle(rem) {
  const start = new Date(rem.datetime);
  const end = new Date(start.getTime() + 30*60*1000);
  const fmt = d => d.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(rem.title)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(rem.message||'')}`;
  window.open(url, '_blank');
}
function bulkGoogleLinks() {
  if (!exams.length) return alert('ยังไม่มีรายการสอบ');
  const first = exams[0];
  openGoogleForExam(first.id);
}

/* =========================
   Mood tracker & suggestions
   ========================= */
function saveMoodAndSuggest() {
  const sel = document.getElementById('moodSelect');
  const mood = sel.value;
  user.mood = mood || null;
  // adjust preferred hour (simple heuristic)
  if (mood === 'sleepy') user.preferredStudyHour = 17;
  if (mood === 'tired') user.preferredStudyHour = 18;
  if (mood === 'ok') user.preferredStudyHour = 19;
  if (mood === 'ready') user.preferredStudyHour = 20;
  save(LS.user, user);
  updateUserUI();
  const sug = document.getElementById('moodSuggestion');
  let text = 'เลือกแผนที่แนะนำด้านล่าง';
  if (mood === 'sleepy') text = 'แนะนำ: Flashcards 5 นาที + พักสั้น ๆ';
  if (mood === 'tired') text = 'แนะนำ: วิดีโอสั้น/Quiz 10 นาที เน้นบทสำคัญ';
  if (mood === 'ok') text = 'แนะนำ: ตามแผนเดิม 25 นาที (Pomodoro)';
  if (mood === 'ready') text = 'แนะนำ: ติวหนัก 45–60 นาที + ทำโจทย์ท้ายบท';
  sug.textContent = text;
}
function clearMood() {
  user.mood = null;
  save(LS.user, user);
  document.getElementById('moodSelect').value = '';
  document.getElementById('moodSuggestion').textContent = '';
}

/* =========================
   AR/VR
   ========================= */
function loadModel() {
  const url = document.getElementById('modelUrl').value.trim();
  const viewer = document.getElementById('viewer');
  if (!url) return alert('ใส่ลิงก์โมเดลก่อน');
  viewer.setAttribute('src', url);
}

/* =========================
   Helpers / sample data
   ========================= */
function fillSampleExam() {
  const subj = 'คณิต';
  const dt = new Date(); dt.setDate(dt.getDate()+3);
  const dateISO = dt.toISOString().slice(0,10);
  const id = Date.now();
  exams.push({ id, subject: subj, date: dateISO, content: 'สมการพื้นฐาน', intensity:'medium', plan: generatePlan(dateISO,'medium')});
  saveLocalExams();
  renderDashboard();
  alert('เติมตัวอย่างแล้ว');
}

function loadSampleReminders() {
  const now = new Date();
  const soon = new Date(now.getTime()+60*1000);
  reminders.push({ id:Date.now()+1, title:'ทบทวนตอนเย็น', datetime: soon.toISOString().slice(0,16), message:'ทบทวนบท 1-2', voiceText:'เริ่มทบทวนตอนนี้', voiceName: (speechSynthesis.getVoices()[0]?.name||''), notified:false, postponed:0 });
  save(LS.reminders, reminders);
  renderReminders();
}

/* expose */
window.fillSampleExam = fillSampleExam;
window.loadSampleReminders = loadSampleReminders;
window.renderDashboard = renderDashboard;
window.renderPlanner = renderPlanner;
window.renderReminders = renderReminders;
window.startPomodoro = startPomodoro;
window.stopPomodoro = stopPomodoro;
window.startShortSession = startShortSession;
window.stopShortSession = stopShortSession;
window.startFlashcardSession = startFlashcardSession;
window.startQuiz = startQuiz;
window.generateAIQuestionsAndPreview = function(){
  const q = generateAIQuestions('ม.4','คณิต','บท1','medium',5);
  console.log('ตัวอย่าง AI-gen questions', q);
};
window.openGoogleForExam = openGoogleForExam;
window.bulkGoogleLinks = bulkGoogleLinks;
window.quickAddGoogle = quickAddGoogle;
window.saveMoodAndSuggest = saveMoodAndSuggest;
window.clearMood = clearMood;
window.runTutor = window.runTutor;
window.loadModel = loadModel;
