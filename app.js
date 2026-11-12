(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const canvas = $('#wheel-canvas');
  const ctx = canvas.getContext('2d');
  const entriesInput = $('#entries-input');
  const resultsText = $('#results-text');
  const STORE_KEY = 'fortunas-rad-v1';
  const colors = ['#ec675d', '#5680d9', '#37a889', '#9272dc', '#d96799', '#4398ba', '#e7894e', '#5278b7', '#ee7580', '#55a89b', '#bd6fc4', '#6b9a50'];
  const defaults = { entries: '', mode: 'wheel', duration: 8, tempo: 'normal', sound: false, removeWinner: false, teamSize: 4 };
  let state = { ...defaults, rotation: 0, spinning: false, groups: null, toastTimer: null, audioContext: null };

  function loadSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return { ...defaults, ...saved };
    } catch (_) {
      return { ...defaults };
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        entries: entriesInput.value,
        mode: state.mode,
        duration: state.duration,
        tempo: state.tempo,
        sound: state.sound,
        removeWinner: state.removeWinner,
        teamSize: state.teamSize
      }));
    } catch (_) {
      // Das Rad bleibt auch ohne lokalen Speicher nutzbar.
    }
  }

  function getEntries() {
    return entriesInput.value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  }

  function randomInt(max) {
    if (max <= 1) return 0;
    if (window.crypto && window.crypto.getRandomValues) {
      const range = 0x100000000;
      const limit = range - (range % max);
      const sample = new Uint32Array(1);
      do { window.crypto.getRandomValues(sample); } while (sample[0] >= limit);
      return sample[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  function shuffled(items) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function drawWheel() {
    const size = canvas.width;
    const center = size / 2;
    const radius = center - 7;
    const entries = getEntries();
    ctx.clearRect(0, 0, size, size);
    const count = entries.length || 10;
    const arc = Math.PI * 2 / count;
    const startAt = -Math.PI / 2;

    for (let i = 0; i < count; i += 1) {
      const start = startAt + i * arc;
      const end = start + arc;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.stroke();

      if (entries.length) {
        const middle = start + arc / 2;
        const labelRadius = radius * (count > 18 ? .65 : .62);
        ctx.save();
        ctx.translate(center + Math.cos(middle) * labelRadius, center + Math.sin(middle) * labelRadius);
        let textAngle = middle + Math.PI / 2;
        if (Math.cos(middle) < 0) textAngle += Math.PI;
        ctx.rotate(textAngle);
        const fontSize = count > 24 ? 10 : count > 16 ? 12 : count > 10 ? 15 : 18;
        ctx.font = '700 ' + fontSize + 'px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(36, 26, 28, .3)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetY = 1;
        ctx.fillText(entries[i], 0, 0, radius * (count > 16 ? .52 : .58));
        ctx.restore();
      }
    }

    ctx.beginPath();
    ctx.arc(center, center, radius - 2, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,.88)';
    ctx.stroke();
  }

  function setEditorTab(tab) {
    const showInput = tab === 'input';
    $('#list-pane').hidden = !showInput;
    $('#results-pane').hidden = showInput;
    $('#input-tab').classList.toggle('is-active', showInput);
    $('#output-tab').classList.toggle('is-active', !showInput);
    $('#input-tab').setAttribute('aria-selected', String(showInput));
    $('#output-tab').setAttribute('aria-selected', String(!showInput));
  }

  function updateCount() {
    const count = getEntries().length;
    const word = count === 1 ? 'Eintrag' : 'Einträge';
    $('#entry-count').textContent = count + ' ' + word;
    $('#input-tab-count').textContent = String(count);
    $('#input-count-label').textContent = count ? count + (count === 1 ? ' Name bereit' : ' Namen bereit') : 'Noch leer';
    $('#wheel-count').textContent = count + (count === 1 ? ' FELD' : ' FELDER');
    $('#wheel-empty').hidden = count > 0;
    $('#spin-button').disabled = count === 0 || state.spinning;
    $('#group-button').disabled = count < 2;
    $('#ready-label').textContent = state.spinning ? 'DREHT …' : count ? 'BEREIT' : 'NOCH LEER';
    $('.ready-pill').classList.toggle('is-spinning', state.spinning);
    $('#spin-caption').textContent = count ? 'Ein Klick — und der Zufall entscheidet.' : 'Füge mindestens einen Eintrag hinzu, dann kann\'s losgehen.';
    if (state.mode !== 'wheel') {
      $('#group-caption').textContent = count < 2 ? 'Füge mindestens zwei Namen hinzu.' : count + (count === 1 ? ' Person ist bereit.' : ' Personen sind bereit.');
    }
  }

  function resetGroupResult() {
    state.groups = null;
    resultsText.value = '';
    $('#copy-result').disabled = true;
    $('#result-tab-dot').hidden = true;
    $('#group-result-preview').hidden = true;
    $('#group-result-preview').replaceChildren();
    $('#group-kicker').textContent = 'GUT GEMISCHT';
    $('#group-title').innerHTML = state.mode === 'teams' ? 'Gute Teams.<br>Gutes Gefühl.' : 'Zufall bringt<br>euch zusammen.';
    $('#group-description').textContent = state.mode === 'teams'
      ? 'Alle Namen werden gemischt und gleichmäßig auf Teams verteilt.'
      : 'Alle Namen werden gemischt und fair zu zweit aufgeteilt. Ein Klick genügt.';
    $('#group-button-label').textContent = state.mode === 'teams' ? 'TEAMS BILDEN' : 'PAARE AUSLOSEN';
    $('#group-caption').textContent = getEntries().length < 2 ? 'Füge mindestens zwei Namen hinzu.' : getEntries().length + ' Personen sind bereit.';
  }

  function applyMode(mode, resetResult) {
    state.mode = mode;
    document.querySelectorAll('.mode-button').forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    const isWheel = mode === 'wheel';
    $('#wheel-area').hidden = !isWheel;
    $('#groups-area').hidden = isWheel;
    $('#editor-tabs').hidden = isWheel;
    $('#team-size-row').hidden = mode !== 'teams';
    $('#play-title').textContent = isWheel ? 'Das Glücksrad' : mode === 'pairs' ? 'Zufällige Paare' : 'Faire Teams';
    $('#play-kicker').textContent = isWheel ? 'JETZT WIRD\'S SPANNEND' : mode === 'pairs' ? 'GUT GEMISCHT' : 'GEMEINSAM STÄRKER';
    if (resetResult !== false) resetGroupResult();
    setEditorTab('input');
    updateCount();
    saveState();
  }

  function handleEntriesChange() {
    drawWheel();
    resetGroupResult();
    updateCount();
    saveState();
  }

  function renderGroupPreview(groups) {
    const box = $('#group-result-preview');
    box.replaceChildren();
    const visible = groups.slice(0, 5);
    visible.forEach((group) => {
      const row = document.createElement('div');
      row.className = 'group-preview-line';
      const label = document.createElement('span');
      const members = document.createElement('span');
      label.textContent = group.label;
      members.textContent = group.members.join(' · ');
      row.append(label, members);
      box.append(row);
    });
    if (groups.length > visible.length) {
      const more = document.createElement('div');
      more.className = 'group-preview-line';
      more.textContent = '… und ' + (groups.length - visible.length) + ' weitere';
      box.append(more);
    }
    box.hidden = false;
  }

  function makePairs(names) {
    const mixed = shuffled(names);
    const groups = [];
    for (let i = 0; i < mixed.length - 1; i += 2) {
      groups.push({ label: 'Paar ' + (groups.length + 1), members: [mixed[i], mixed[i + 1]] });
    }
    if (mixed.length % 2) {
      groups.push({ label: 'Freilos', members: [mixed[mixed.length - 1]] });
    }
    const lines = ['ZUFÄLLIGE PAARE', ''];
    groups.forEach((group) => {
      if (group.label === 'Freilos') lines.push('Freilos: ' + group.members[0]);
      else lines.push(group.label + ': ' + group.members[0] + '  ×  ' + group.members[1]);
    });
    return { groups, text: lines.join('\n') };
  }

  function makeTeams(names, size) {
    const mixed = shuffled(names);
    const teamCount = Math.ceil(mixed.length / size);
    const groups = Array.from({ length: teamCount }, (_, i) => ({ label: 'Team ' + (i + 1), members: [] }));
    mixed.forEach((name, index) => groups[index % teamCount].members.push(name));
    const lines = ['ZUFÄLLIGE TEAMS (' + size + ' Personen pro Team)', ''];
    groups.forEach((group) => lines.push(group.label + ': ' + group.members.join(' · ')));
    return { groups, text: lines.join('\n') };
  }

  function generateGroups() {
    const names = getEntries();
    if (names.length < 2) {
      showToast('Für eine faire Aufteilung brauchst du mindestens zwei Namen.');
      return;
    }
    const rawSize = Number($('#team-size').value);
    state.teamSize = Math.min(20, Math.max(2, Number.isFinite(rawSize) ? Math.round(rawSize) : 4));
    $('#team-size').value = String(state.teamSize);
    state.groups = state.mode === 'teams' ? makeTeams(names, state.teamSize) : makePairs(names);
    resultsText.value = state.groups.text;
    $('#copy-result').disabled = false;
    $('#result-tab-dot').hidden = false;
    $('#group-kicker').textContent = state.mode === 'teams' ? 'DIE TEAMS STEHEN FEST' : 'DIE PAARE STEHEN FEST';
    $('#group-title').textContent = state.mode === 'teams' ? state.groups.groups.length + ' Teams. Ein gutes Team.' : Math.floor(names.length / 2) + (Math.floor(names.length / 2) === 1 ? ' Paar ist gefunden.' : ' Paare sind gefunden.');
    $('#group-description').textContent = state.mode === 'teams'
      ? names.length + ' Namen fair auf ' + state.groups.groups.length + ' Teams verteilt.'
      : names.length % 2 ? 'Alle sind dabei — eine Person hat diesmal ein Freilos.' : 'Alle Namen wurden zufällig zu Paaren gemischt.';
    $('#group-button-label').textContent = state.mode === 'teams' ? 'NOCH EINMAL MISCHEN' : 'NOCH EINMAL AUSLOSEN';
    renderGroupPreview(state.groups.groups);
    $('#group-caption').textContent = 'Fertig — dein Ergebnis steht im zweiten Reiter.';
    setEditorTab('output');
    saveState();
  }

  function playTick() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!state.audioContext) state.audioContext = new Audio();
      const audio = state.audioContext;
      if (audio.state === 'suspended') audio.resume();
      const oscillator = audio.createOscillator();
      const volume = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(550, audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(230, audio.currentTime + .045);
      volume.gain.setValueAtTime(.045, audio.currentTime);
      volume.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .05);
      oscillator.connect(volume);
      volume.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + .052);
    } catch (_) {
      // Sound is optional; the wheel keeps working if the browser blocks audio.
    }
  }

  function removeWinnerFromList(index) {
    const lines = entriesInput.value.split(/\r?\n/);
    let seen = 0;
    let removed = false;
    const remaining = lines.filter((line) => {
      if (!line.trim()) return true;
      if (!removed && seen === index) { removed = true; seen += 1; return false; }
      seen += 1;
      return true;
    });
    entriesInput.value = remaining.join('\n');
    handleEntriesChange();
  }

  async function spinWheel() {
    const names = getEntries();
    if (!names.length || state.spinning) return;
    state.spinning = true;
    updateCount();
    $('#winner-result').hidden = true;
    const winnerIndex = randomInt(names.length);
    const winner = names[winnerIndex];
    const targetNorm = ((-((winnerIndex + .5) * 360 / names.length) % 360) + 360) % 360;
    const currentNorm = ((state.rotation % 360) + 360) % 360;
    const delta = (targetNorm - currentNorm + 360) % 360;
    const nextRotation = state.rotation + (5 + randomInt(3)) * 360 + delta;
    const tempo = { ruhig: { factor: 1.2, curve: 'cubic-bezier(.08,.52,.12,1)' }, normal: { factor: 1, curve: 'cubic-bezier(.13,.76,.11,1)' }, flott: { factor: .82, curve: 'cubic-bezier(.19,.82,.15,1)' } }[state.tempo] || { factor: 1, curve: 'cubic-bezier(.13,.76,.11,1)' };
    const seconds = Number(state.duration) * tempo.factor;
    canvas.style.transitionDuration = seconds + 's';
    canvas.style.transitionTimingFunction = tempo.curve;
    const soundTimer = state.sound ? window.setInterval(playTick, 145) : null;
    canvas.style.transform = 'rotate(' + nextRotation + 'deg)';
    state.rotation = nextRotation;
    await new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(fallback);
        canvas.removeEventListener('transitionend', onEnd);
        resolve();
      };
      const onEnd = (event) => { if (event.propertyName === 'transform') finish(); };
      const fallback = window.setTimeout(finish, seconds * 1000 + 500);
      canvas.addEventListener('transitionend', onEnd);
    });
    if (soundTimer) window.clearInterval(soundTimer);
    state.spinning = false;
    $('#winner-name').textContent = winner;
    $('#winner-result').hidden = false;
    updateCount();
    if (state.removeWinner) {
      removeWinnerFromList(winnerIndex);
      showToast(winner + ' hat gewonnen und wurde aus der Liste genommen.');
    } else {
      showToast(winner + ' — das Glück hat entschieden!');
    }
  }

  function saveList() {
    const entries = getEntries();
    if (!entries.length) {
      showToast('Deine Liste ist noch leer.');
      entriesInput.focus();
      return;
    }
    const blob = new Blob([entriesInput.value.replace(/\r\n?/g, '\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fortunas-rad-liste.txt';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Liste als Textdatei gespeichert.');
  }

  async function loadList(file) {
    if (!file) return;
    try {
      const text = await file.text();
      entriesInput.value = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
      handleEntriesChange();
      const count = getEntries().length;
      showToast(count + (count === 1 ? ' Eintrag geladen.' : ' Einträge geladen.'));
    } catch (_) {
      showToast('Die Datei konnte nicht gelesen werden.');
    }
    $('#file-input').value = '';
  }

  async function copyResult() {
    if (!resultsText.value) return;
    try {
      await navigator.clipboard.writeText(resultsText.value);
      showToast('Ergebnis in die Zwischenablage kopiert.');
    } catch (_) {
      resultsText.focus();
      resultsText.select();
      const copied = document.execCommand('copy');
      showToast(copied ? 'Ergebnis in die Zwischenablage kopiert.' : 'Ergebnis markieren und kopieren.');
    }
  }

  function initialize() {
    const saved = loadSaved();
    state = { ...state, ...saved };
    entriesInput.value = typeof saved.entries === 'string' ? saved.entries : '';
    state.duration = Math.min(15, Math.max(3, Number(saved.duration) || 8));
    state.teamSize = Math.min(20, Math.max(2, Number(saved.teamSize) || 4));
    state.tempo = ['ruhig', 'normal', 'flott'].includes(saved.tempo) ? saved.tempo : 'normal';
    state.mode = ['wheel', 'pairs', 'teams'].includes(saved.mode) ? saved.mode : 'wheel';
    state.sound = Boolean(saved.sound);
    state.removeWinner = Boolean(saved.removeWinner);
    $('#duration-range').value = String(state.duration);
    $('#duration-value').textContent = state.duration + ' s';
    $('#tempo-select').value = state.tempo;
    $('#sound-toggle').checked = state.sound;
    $('#remove-winner-toggle').checked = state.removeWinner;
    $('#team-size').value = String(state.teamSize);
    applyMode(state.mode, false);
    drawWheel();
    updateCount();
  }

  document.querySelectorAll('.mode-button').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.mode !== state.mode) applyMode(button.dataset.mode, true);
    });
  });
  entriesInput.addEventListener('input', handleEntriesChange);
  $('#input-tab').addEventListener('click', () => setEditorTab('input'));
  $('#output-tab').addEventListener('click', () => setEditorTab('output'));
  $('#spin-button').addEventListener('click', spinWheel);
  $('#spin-again').addEventListener('click', spinWheel);
  $('#group-button').addEventListener('click', generateGroups);
  $('#save-list').addEventListener('click', saveList);
  $('#load-list').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', (event) => loadList(event.target.files[0]));
  $('#copy-result').addEventListener('click', copyResult);
  $('#team-size').addEventListener('change', () => { state.teamSize = Math.min(20, Math.max(2, Number($('#team-size').value) || 4)); $('#team-size').value = String(state.teamSize); saveState(); });
  $('#team-minus').addEventListener('click', () => { $('#team-size').value = String(Math.max(2, Number($('#team-size').value) - 1)); $('#team-size').dispatchEvent(new Event('change')); });
  $('#team-plus').addEventListener('click', () => { $('#team-size').value = String(Math.min(20, Number($('#team-size').value) + 1)); $('#team-size').dispatchEvent(new Event('change')); });

  $('#duration-range').addEventListener('input', (event) => {
    state.duration = Number(event.target.value);
    $('#duration-value').textContent = state.duration + ' s';
    saveState();
  });
  $('#tempo-select').addEventListener('change', (event) => { state.tempo = event.target.value; saveState(); });
  $('#sound-toggle').addEventListener('change', (event) => { state.sound = event.target.checked; saveState(); });
  $('#remove-winner-toggle').addEventListener('change', (event) => { state.removeWinner = event.target.checked; saveState(); });

  const settingsToggle = $('#settings-toggle');
  const settingsPanel = $('#settings-panel');
  settingsToggle.addEventListener('click', () => {
    settingsPanel.hidden = !settingsPanel.hidden;
    settingsToggle.setAttribute('aria-expanded', String(!settingsPanel.hidden));
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.settings-anchor')) {
      settingsPanel.hidden = true;
      settingsToggle.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !settingsPanel.hidden) {
      settingsPanel.hidden = true;
      settingsToggle.setAttribute('aria-expanded', 'false');
      settingsToggle.focus();
    }
  });
  window.addEventListener('resize', drawWheel);
  initialize();
})();
