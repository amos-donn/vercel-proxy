import type { CanvasDraft } from '../types'

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => {
    if (ch === '&') return '&amp;'
    if (ch === '<') return '&lt;'
    if (ch === '>') return '&gt;'
    if (ch === '"') return '&quot;'
    return '&#39;'
  })

function titleFrom(goal: string): string {
  const cleaned = goal.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'Untitled canvas'
  const words = cleaned.split(' ').slice(0, 7).join(' ')
  return (words.charAt(0).toUpperCase() + words.slice(1)).replace(/[.?!]+$/, '')
}

export function wantsCanvas(goal: string): boolean {
  return /\b(canvas|preview|mockup|landing page|web ?page|dashboard|component|prototype|calculator|todo list|html|css|ui)\b/i.test(
    goal,
  )
}

const sharedCss = `:root { color-scheme: dark; --bg: #0a0b09; --panel: #12150f; --panel-2: #171a13; --line: #262b20; --ink: #eef3e6; --muted: #9aa392; --accent: #b8f24d; --accent-soft: rgba(184, 242, 77, 0.12); }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--ink); font-family: Inter, system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }
button, input { font: inherit; }
h1, h2 { font-family: Georgia, 'Times New Roman', serif; font-weight: 400; letter-spacing: -0.02em; }
.kicker { margin: 0 0 10px; color: var(--accent); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; }
.btn { padding: 8px 14px; border: 1px solid var(--accent); border-radius: 999px; background: var(--accent); color: #0b1204; font-size: 12px; font-weight: 650; cursor: pointer; }
.btn:hover { filter: brightness(1.06); }
.btn.ghost { border-color: var(--line); background: transparent; color: var(--ink); }
.panel { border: 1px solid var(--line); border-radius: 14px; background: var(--panel); }
`

function dashboard(goal: string): CanvasDraft {
  const title = titleFrom(goal)
  return {
    name: title.slice(0, 46) || 'Ops dashboard',
    description: 'A live dashboard canvas with real range switching and refresh behaviour.',
    html: `<main class="shell">
  <header class="top">
    <div>
      <p class="kicker">Mezze canvas</p>
      <h1>${escapeHtml(title)}</h1>
    </div>
    <button id="refresh" class="btn">Refresh data</button>
  </header>
  <section class="stats">
    <article class="stat"><span>Active users</span><strong id="a">1,284</strong><small class="up">+12.4%</small></article>
    <article class="stat"><span>Runs today</span><strong id="b">318</strong><small class="up">+6.1%</small></article>
    <article class="stat"><span>Fast-path share</span><strong id="c">71%</strong><small>42 decisions</small></article>
  </section>
  <section class="panel chart-panel">
    <div class="panel-head">
      <h2>Volume</h2>
      <div class="seg" id="range">
        <button data-days="7" class="on">7d</button>
        <button data-days="14">14d</button>
        <button data-days="30">30d</button>
      </div>
    </div>
    <div class="chart" id="chart"></div>
  </section>
  <section class="panel">
    <h2>Recent runs</h2>
    <ul class="list">
      <li><span class="dot"></span> Release notes drafted <em>2m</em></li>
      <li><span class="dot"></span> MCP tool echoed a payload <em>18m</em></li>
      <li><span class="dot"></span> Workspace snapshot saved <em>1h</em></li>
    </ul>
  </section>
</main>`,
    css: `${sharedCss}
.shell { width: min(1080px, 100%); margin: 0 auto; padding: 34px 28px 44px; }
.top { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
h1 { margin: 0; font-size: clamp(30px, 4vw, 44px); line-height: 1.02; }
h2 { margin: 0; font-size: 16px; }
.stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 10px; }
.stat { display: flex; flex-direction: column; gap: 6px; padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); }
.stat span { color: var(--muted); font-size: 11px; }
.stat strong { font-family: Georgia, serif; font-size: 28px; font-weight: 400; font-variant-numeric: tabular-nums; }
.stat small { color: var(--muted); font-size: 10px; }
.stat small.up { color: var(--accent); }
.chart-panel { padding: 16px; margin-bottom: 10px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.seg { display: flex; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 999px; }
.seg button { padding: 4px 10px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font-size: 10px; cursor: pointer; }
.seg button.on { background: var(--accent-soft); color: var(--accent); }
.chart { display: flex; align-items: flex-end; gap: 5px; height: 170px; padding-top: 8px; }
.bar { flex: 1; min-width: 3px; border-radius: 3px 3px 0 0; background: var(--accent); animation: grow 420ms ease both; }
@keyframes grow { from { transform: scaleY(0.2); opacity: 0; } to { transform: scaleY(1); opacity: 1; } }
.panel:last-child { padding: 16px; }
.list { margin: 12px 0 0; padding: 0; list-style: none; }
.list li { display: flex; align-items: center; gap: 9px; padding: 9px 0; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
.list li:first-child { border-top: 0; }
.list em { margin-left: auto; font-style: normal; font-size: 10px; color: #6f7768; }
.dot { width: 6px; height: 6px; border-radius: 99px; background: var(--accent); }
@media (max-width: 640px) { .stats { grid-template-columns: 1fr; } .top { align-items: flex-start; flex-direction: column; } }`,
    js: `const chart = document.getElementById('chart')
const series = {
  7: [42, 58, 49, 71, 64, 88, 96],
  14: [34, 41, 38, 52, 47, 61, 58, 66, 59, 74, 69, 81, 77, 92],
  30: [22, 28, 25, 33, 31, 39, 36, 44, 41, 49, 46, 54, 51, 60, 57, 65, 61, 70, 66, 75, 71, 79, 76, 84, 81, 88, 86, 93, 90, 97],
}
function render(days) {
  const data = series[days]
  const max = Math.max(...data)
  chart.innerHTML = ''
  data.forEach((value, index) => {
    const bar = document.createElement('div')
    bar.className = 'bar'
    bar.style.height = (10 + (value / max) * 90) + '%'
    bar.style.animationDelay = (index * 16) + 'ms'
    bar.title = value + ' runs'
    chart.appendChild(bar)
  })
}
document.getElementById('range').addEventListener('click', (event) => {
  const button = event.target.closest('button')
  if (!button) return
  ;[...event.currentTarget.children].forEach((item) => item.classList.toggle('on', item === button))
  render(Number(button.dataset.days))
})
document.getElementById('refresh').addEventListener('click', (event) => {
  const jiggle = (id, base) => {
    document.getElementById(id).textContent = (base + Math.floor(Math.random() * 90)).toLocaleString()
  }
  jiggle('a', 1200)
  jiggle('b', 300)
  event.currentTarget.textContent = 'Refreshed'
  window.setTimeout(() => { event.currentTarget.textContent = 'Refresh data' }, 1100)
  render(7)
})
render(7)`,
  }
}

function todo(goal: string): CanvasDraft {
  const title = titleFrom(goal)
  return {
    name: title.slice(0, 46) || 'Task board',
    description: 'A working task list canvas: add, complete, filter and clear.',
    html: `<main class="shell">
  <p class="kicker">Mezze canvas</p>
  <h1>${escapeHtml(title)}</h1>
  <p class="lede">Add a task, mark it done, filter the list. State is local to this sandbox.</p>
  <form id="add" class="add">
    <input id="text" placeholder="What needs doing?" autocomplete="off" aria-label="New task" />
    <button class="btn" type="submit">Add</button>
  </form>
  <div class="filters" id="filters">
    <button data-filter="all" class="on">All</button>
    <button data-filter="open">Open</button>
    <button data-filter="done">Done</button>
  </div>
  <ul id="list" class="list"></ul>
  <footer><span id="count">0 tasks</span><button id="clear" class="link">Clear done</button></footer>
</main>`,
    css: `${sharedCss}
.shell { width: min(620px, 100%); margin: 0 auto; padding: 44px 24px; }
h1 { margin: 0 0 10px; font-size: clamp(32px, 5vw, 46px); line-height: 1.03; }
.lede { margin: 0 0 22px; color: var(--muted); font-size: 13px; line-height: 1.6; }
.add { display: flex; gap: 8px; }
.add input { flex: 1; min-width: 0; padding: 10px 14px; border: 1px solid var(--line); border-radius: 999px; background: var(--panel); color: var(--ink); font-size: 13px; outline: none; }
.add input:focus { border-color: rgba(184, 242, 77, 0.55); }
.filters { display: flex; gap: 3px; margin: 16px 0 6px; }
.filters button { padding: 5px 11px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font-size: 11px; cursor: pointer; }
.filters button.on { background: var(--accent-soft); color: var(--accent); }
.list { margin: 0; padding: 0; list-style: none; }
.task { display: flex; align-items: center; gap: 11px; padding: 12px 4px; border-top: 1px solid var(--line); }
.task button.check { width: 19px; height: 19px; flex: 0 0 auto; border: 1px solid var(--line); border-radius: 6px; background: transparent; cursor: pointer; }
.task.done button.check { border-color: var(--accent); background: var(--accent); }
.task span { flex: 1; font-size: 13px; }
.task.done span { color: #6f7768; text-decoration: line-through; }
.task button.remove { border: 0; background: transparent; color: #6f7768; font-size: 16px; cursor: pointer; opacity: 0; }
.task:hover button.remove { opacity: 1; }
footer { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; color: var(--muted); font-size: 11px; }
.link { border: 0; background: transparent; color: var(--muted); font-size: 11px; cursor: pointer; text-decoration: underline; }
.empty { padding: 26px 0; color: #6f7768; font-size: 12px; text-align: center; }`,
    js: `const list = document.getElementById('list')
const count = document.getElementById('count')
const filters = document.getElementById('filters')
let tasks = [
  { id: 1, text: 'Sketch the first screen', done: false },
  { id: 2, text: 'Wire the sandbox preview', done: true },
]
let filter = 'all'
function visible() {
  if (filter === 'open') return tasks.filter((task) => !task.done)
  if (filter === 'done') return tasks.filter((task) => task.done)
  return tasks
}
function paint() {
  list.innerHTML = ''
  const rows = visible()
  if (!rows.length) {
    const empty = document.createElement('li')
    empty.className = 'empty'
    empty.textContent = filter === 'done' ? 'Nothing finished yet.' : 'Nothing here. Add a task.'
    list.appendChild(empty)
  }
  rows.forEach((task) => {
    const row = document.createElement('li')
    row.className = 'task' + (task.done ? ' done' : '')
    row.innerHTML = '<button class="check" aria-label="Toggle"></button><span></span><button class="remove" aria-label="Remove">×</button>'
    row.querySelector('span').textContent = task.text
    row.querySelector('.check').addEventListener('click', () => {
      task.done = !task.done
      paint()
    })
    row.querySelector('.remove').addEventListener('click', () => {
      tasks = tasks.filter((item) => item.id !== task.id)
      paint()
    })
    list.appendChild(row)
  })
  const open = tasks.filter((task) => !task.done).length
  count.textContent = tasks.length + ' tasks · ' + open + ' open'
}
document.getElementById('add').addEventListener('submit', (event) => {
  event.preventDefault()
  const input = document.getElementById('text')
  const text = input.value.trim()
  if (!text) return
  tasks.unshift({ id: Date.now(), text, done: false })
  input.value = ''
  paint()
})
filters.addEventListener('click', (event) => {
  const button = event.target.closest('button')
  if (!button) return
  filter = button.dataset.filter
  ;[...filters.children].forEach((item) => item.classList.toggle('on', item === button))
  paint()
})
document.getElementById('clear').addEventListener('click', () => {
  tasks = tasks.filter((task) => !task.done)
  paint()
})
paint()`,
  }
}

function landing(goal: string): CanvasDraft {
  const title = titleFrom(goal)
  return {
    name: title.slice(0, 46) || 'Landing page',
    description: 'A responsive landing canvas with an interactive call to action.',
    html: `<main class="shell">
  <nav><span class="mark">Mezze</span><div class="navlinks"><a href="#features">Features</a><a href="#signal">Signal</a></div></nav>
  <header class="hero">
    <p class="kicker">a canvas, not a mockup</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="lede">Everything here is live HTML, CSS and JavaScript. Edit it, run it, and the preview follows.</p>
    <div class="cta">
      <button id="join" class="btn">Join the waitlist</button>
      <a class="ghost-link" href="#features">See what is inside →</a>
    </div>
    <p id="joined" class="joined" hidden>You are on the list. Nothing was sent anywhere.</p>
  </header>
  <section id="features" class="features">
    <article><h2>Readable plans</h2><p>Decisions arrive with a reason, not a spinner.</p></article>
    <article><h2>Your keys</h2><p>Provider keys stay encrypted and write-only.</p></article>
    <article><h2>Real tools</h2><p>MCP servers expose actual schemas and output.</p></article>
  </section>
  <section id="signal" class="signal">
    <div><p class="kicker">signal</p><h2>Dual process, one workspace.</h2></div>
    <p>Typed routing for the small calls. A slower lane for the writing that matters. The split is visible in every turn.</p>
  </section>
  <footer>Built in the Mezze canvas sandbox.</footer>
</main>`,
    css: `${sharedCss}
.shell { width: min(1000px, 100%); margin: 0 auto; padding: 24px 26px 40px; }
nav { display: flex; align-items: center; justify-content: space-between; padding-bottom: 26px; }
.mark { font-family: Georgia, serif; font-size: 18px; letter-spacing: -0.02em; }
.navlinks { display: flex; gap: 18px; }
.navlinks a { color: var(--muted); font-size: 11px; text-decoration: none; }
.hero { max-width: 700px; padding: 58px 0 54px; }
h1 { margin: 0 0 18px; font-size: clamp(42px, 7vw, 74px); line-height: 0.98; letter-spacing: -0.03em; }
.lede { max-width: 520px; margin: 0 0 26px; color: var(--muted); font-size: 14px; line-height: 1.7; }
.cta { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.ghost-link { color: var(--muted); font-size: 12px; text-decoration: none; }
.ghost-link:hover { color: var(--ink); }
.joined { margin: 18px 0 0; color: var(--accent); font-size: 12px; }
.features { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 18px 0 8px; border-top: 1px solid var(--line); }
.features article { padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); }
.features h2 { margin: 0 0 7px; font-size: 16px; }
.features p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.signal { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; align-items: end; margin-top: 34px; padding-top: 30px; border-top: 1px solid var(--line); }
.signal h2 { margin: 0; font-size: 30px; line-height: 1.1; }
.signal > p { margin: 0; color: var(--muted); font-size: 12.5px; line-height: 1.7; }
footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--line); color: #6f7768; font-size: 10px; }
@media (max-width: 720px) { .features { grid-template-columns: 1fr; } .signal { grid-template-columns: 1fr; } .hero { padding-top: 34px; } }`,
    js: `const button = document.getElementById('join')
const note = document.getElementById('joined')
button.addEventListener('click', () => {
  note.hidden = false
  button.textContent = 'You are in'
  button.disabled = true
  button.style.opacity = '0.65'
})`,
  }
}

export function simulateCanvas(goal: string): CanvasDraft {
  if (/\b(dashboard|analytics|metrics|stats|admin)\b/i.test(goal)) return dashboard(goal)
  if (/\b(todo|task|checklist|board)\b/i.test(goal)) return todo(goal)
  return landing(goal)
}
