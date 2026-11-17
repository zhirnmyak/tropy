/**
 * Настройки доступности (версия для слабовидящих по ГОСТ Р 52872-2019) и озвучивание текста.
 * Настройки применяются мгновенно через data-атрибуты <html> (см. css/app.css),
 * сохраняются в браузере и — для вошедших пользователей — в профиле на сервере.
 */
(function () {
  'use strict';
  var App = window.App, h = App.html;
  var KEY = 'tropy.a11y';
  var DEFAULTS = { theme: 'auto', font: '100', spacing: '0', lh: '0', family: 'sans', images: 'on', motion: 'on', simple: 'off', links: 'off', rate: '1' };

  var OPTIONS = {
    font: { legend: 'Размер текста', items: [['100', 'Обычный'], ['125', 'Крупный — 125%'], ['150', 'Очень крупный — 150%'], ['200', 'Максимальный — 200%']] },
    theme: { legend: 'Цветовая схема', items: [['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная'], ['bw', 'Чёрным по белому'], ['wb', 'Белым по чёрному'], ['blue', 'Тёмно-синим по голубому'], ['brown', 'Коричневым по бежевому'], ['green', 'Зелёным по тёмно-коричневому']] },
    family: { legend: 'Шрифт', items: [['sans', 'Обычный: текст без засечек'], ['serif', 'Весь текст с засечками'], ['readable', 'Удобочитаемый, с крупными буквами']] },
    spacing: { legend: 'Расстояние между буквами', items: [['0', 'Обычное'], ['1', 'Увеличенное'], ['2', 'Большое']] },
    lh: { legend: 'Расстояние между строками', items: [['0', 'Обычное'], ['1', 'Полуторное'], ['2', 'Двойное']] },
    images: { legend: 'Изображения', items: [['on', 'Показывать'], ['gray', 'Чёрно-белые'], ['off', 'Скрыть и показывать описание']] }
  };

  function get() { return Object.assign({}, DEFAULTS, App.store.get(KEY, {})); }
  function apply(s) {
    var root = document.documentElement;
    ['theme', 'font', 'spacing', 'lh', 'family', 'images', 'motion', 'simple', 'links'].forEach(function (k) { root.setAttribute('data-' + k, s[k]); });
    root.style.setProperty('--scale', String(Number(s.font) / 100));
    var meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', { dark: '#191918', wb: '#000000', blue: '#9DD1FF', brown: '#F7F3D6', green: '#3B2716', bw: '#FFFFFF' }[s.theme] || '#1B5FA8');
  }
  var syncTimer = null;
  function set(patch, opts) {
    var s = Object.assign(get(), patch);
    App.store.set(KEY, s);
    apply(s);
    if (App.state.user && !(opts && opts.noSync)) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(function () {
        var settings = Object.assign({}, App.state.user.settings || {}, { a11y: s });
        App.api.patch('me', { settings: settings }).then(function (r) { if (r && r.user) App.state.user = r.user; }).catch(function () { /* не критично */ });
      }, 800);
    }
    return s;
  }

  App.a11y = {
    get: get, set: set, apply: apply, DEFAULTS: DEFAULTS,
    /** После входа: применяем настройки, сохранённые в профиле */
    fromUser: function (user) { if (user && user.settings && user.settings.a11y) set(user.settings.a11y, { noSync: true }); },
    open: function () { App.openDialog('a11y-dialog', render(get())); }
  };

  function radios(name, s) {
    var o = OPTIONS[name];
    return h`<fieldset class="a11y-group a11y-${name}"><legend>${o.legend}</legend><div class="seg">
      ${o.items.map(function (it) {
        var id = 'a11y-' + name + '-' + it[0];
        return h`<label class="seg-item" for="${id}"><input type="radio" id="${id}" name="${name}" value="${it[0]}"${App.on(String(s[name]) === it[0], 'checked')}>
          ${name === 'theme' ? h`<span class="swatch swatch-${it[0]}" aria-hidden="true">Аа</span>` : ''}<span>${it[1]}</span></label>`;
      })}</div></fieldset>`;
  }
  function render(s) {
    var tts = 'speechSynthesis' in window;
    return h`<div class="dialog-head">
        <h2 id="a11y-title" class="dialog-title">${App.icon('eye')} Настройки доступности</h2>
        <button type="button" class="btn btn-ghost btn-icon" data-action="close-dialog" aria-label="Закрыть настройки">${App.icon('x')}</button>
      </div>
      <form class="dialog-body a11y-form" data-change="a11y" aria-describedby="a11y-desc">
        <p id="a11y-desc" class="muted small">Изменения применяются сразу и сохраняются в этом браузере${App.state.user ? ' и в вашем профиле' : ''}. Настройки соответствуют ГОСТ Р 52872-2019.</p>
        ${radios('font', s)}${radios('theme', s)}${radios('family', s)}${radios('spacing', s)}${radios('lh', s)}${radios('images', s)}
        <fieldset class="a11y-group"><legend>Дополнительно</legend>
          <label class="check"><input type="checkbox" name="motion" value="off"${App.on(s.motion === 'off', 'checked')}><span>Отключить анимацию и плавную прокрутку</span></label>
          <label class="check"><input type="checkbox" name="simple" value="on"${App.on(s.simple === 'on', 'checked')}><span>Упрощённый вид: одна колонка, крупные кнопки, без декоративных элементов</span></label>
          <label class="check"><input type="checkbox" name="links" value="on"${App.on(s.links === 'on', 'checked')}><span>Выделять ссылки фоном и подчёркиванием</span></label>
        </fieldset>
        <fieldset class="a11y-group"><legend>Озвучивание текста</legend>
          ${tts ? h`<div class="field"><label for="a11y-rate">Скорость речи</label>
            <select class="select" id="a11y-rate" name="rate">
              ${[['0.8', 'Медленно'], ['1', 'Обычно'], ['1.25', 'Быстро'], ['1.5', 'Очень быстро']].map(function (o) { return h`<option value="${o[0]}"${App.on(String(s.rate) === o[0], 'selected')}>${o[1]}</option>`; })}
            </select></div>
            <p class="small muted">На странице маршрута есть кнопки «Озвучить» — текст читает синтезатор речи вашего устройства.</p>
            <button type="button" class="btn btn-secondary btn-small" data-action="tts" data-text="Так будет звучать озвучивание описаний маршрутов.">${App.icon('sound')} Проверить голос</button>`
          : h`<p class="small">Ваш браузер не поддерживает синтез речи. Используйте экранный диктор (NVDA, JAWS, VoiceOver, TalkBack) — сайт с ними совместим.</p>`}
        </fieldset>
        <div class="dialog-actions">
          <button type="button" class="btn btn-secondary" data-action="a11y-reset">Сбросить настройки</button>
          <button type="button" class="btn btn-primary" data-action="close-dialog">Готово</button>
        </div>
      </form>`;
  }

  var LABELS = { font: 'Размер текста', theme: 'Цветовая схема', family: 'Шрифт', spacing: 'Расстояние между буквами', lh: 'Расстояние между строками', images: 'Изображения' };
  App.change('a11y', function (form, e) {
    var t = e.target, patch = {};
    if (t.type === 'checkbox') patch[t.name] = t.checked ? t.value : DEFAULTS[t.name];
    else patch[t.name] = t.value;
    set(patch);
    if (OPTIONS[t.name]) {
      var item = OPTIONS[t.name].items.find(function (x) { return x[0] === t.value; });
      App.announce(LABELS[t.name] + ': ' + (item ? item[1] : t.value));
    } else if (t.type === 'checkbox') App.announce((t.checked ? 'Включено: ' : 'Выключено: ') + t.parentNode.textContent.trim());
  });

  App.actions({
    'open-a11y': function () { App.a11y.open(); },
    'close-dialog': function (el) { var d = el.closest('dialog'); if (d) App.closeDialog(d); },
    'a11y-reset': function () {
      set(Object.assign({}, DEFAULTS));
      var d = document.getElementById('a11y-dialog');
      d.innerHTML = String(render(get()));
      App.announce('Настройки доступности сброшены');
      var f = d.querySelector('h2'); if (f) App.focus(f, { scroll: false });
    },
    tts: function (el) {
      if (App.tts.speaking && App.tts.button === el) { App.tts.stop(); return; }
      var text = el.getAttribute('data-text');
      var sel = el.getAttribute('data-tts');
      if (!text && sel) { var t = document.querySelector(sel); text = t ? t.innerText : ''; }
      App.tts.speak(text, el);
    }
  });

  /* ---------- Озвучивание (Web Speech API) ---------- */

  var voice = null;
  function pickVoice() {
    var list = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    voice = list.find(function (v) { return /^ru/i.test(v.lang) && /google|milena|yandex|irina|pavel/i.test(v.name); }) || list.find(function (v) { return /^ru/i.test(v.lang); }) || null;
  }
  if ('speechSynthesis' in window) { pickVoice(); window.speechSynthesis.onvoiceschanged = pickVoice; }

  function setButton(btn, on) {
    if (!btn || !document.contains(btn)) return;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    var label = btn.querySelector('.tts-label');
    if (label) label.textContent = on ? 'Остановить' : (btn.getAttribute('data-label') || 'Озвучить');
  }
  App.tts = {
    supported: 'speechSynthesis' in window,
    speaking: false, button: null,
    speak: function (text, btn) {
      if (!this.supported) { App.toast('Браузер не поддерживает озвучивание. Воспользуйтесь экранным диктором.', 'warn'); return; }
      this.stop();
      text = String(text || '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      var self = this, rate = Number(get().rate) || 1;
      // Длинный текст делим на фразы: некоторые браузеры обрывают длинные высказывания
      var parts = text.match(/[^.!?…]+[.!?…]*\s*/g) || [text], chunks = [], cur = '';
      parts.forEach(function (p) { if ((cur + p).length > 220 && cur) { chunks.push(cur); cur = ''; } cur += p; });
      if (cur) chunks.push(cur);
      this.speaking = true; this.button = btn || null;
      setButton(btn, true);
      chunks.forEach(function (c, i) {
        var u = new SpeechSynthesisUtterance(c);
        u.lang = 'ru-RU'; u.rate = rate;
        if (voice) u.voice = voice;
        if (i === chunks.length - 1) u.onend = function () { self.speaking = false; setButton(btn, false); };
        u.onerror = function () { self.speaking = false; setButton(btn, false); };
        window.speechSynthesis.speak(u);
      });
      App.announce('Озвучивание началось');
    },
    stop: function () {
      if (!this.supported) return;
      window.speechSynthesis.cancel();
      if (this.speaking) setButton(this.button, false);
      this.speaking = false; this.button = null;
    }
  };
  App.listen('rendered', function () { App.tts.stop(); });

  apply(get());
})();
