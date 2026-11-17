/** Вход и регистрация. Пароль можно показать; «Запомнить меня» включено по умолчанию; потребности — по желанию, с явным согласием */
(function () {
  'use strict';
  var App = window.App, h = App.html, ui = App.ui, D = App.D, S = App.state;

  function nextPath(q) { var n = q.get('next') || ''; return /^\/[\w\-/?=&%,.]*$/.test(n) && n.indexOf('/login') !== 0 && n.indexOf('/register') !== 0 ? n : '/profile'; }

  App.route('/login', function (ctx) {
    if (S.user) return { title: 'Вход', html: h`<div class="container page page-narrow">${ui.pageHead({ title: 'Вы уже вошли', lead: 'Вы вошли как ' + S.user.name + '.' })}<div class="row"><a class="btn btn-primary" href="#/profile">Личный кабинет</a><button type="button" class="btn btn-secondary" data-action="logout">Выйти</button></div></div>` };
    var next = nextPath(ctx.query);
    return {
      title: 'Вход',
      html: h`<div class="container page page-narrow">
        ${ui.pageHead({ crumbs: [['Вход']], title: 'Вход', lead: 'Войдите, чтобы сохранять избранное, планы походов и списки снаряжения.' })}
        <div class="auth-grid">
          <form class="form card form-card" data-form="login" data-next="${next}" novalidate>
            ${ui.field({ name: 'email', label: 'Электронная почта', type: 'email', required: true, autocomplete: 'username', inputmode: 'email', id: 'login-email' })}
            ${ui.field({ name: 'password', label: 'Пароль', type: 'password', required: true, autocomplete: 'current-password', toggle: true, id: 'login-password' })}
            <label class="check"><input type="checkbox" name="remember" value="1" checked><span>Запомнить меня на этом устройстве<small>Не отмечайте на чужом компьютере</small></span></label>
            <div class="form-actions"><button type="submit" class="btn btn-primary btn-block">Войти</button></div>
            <p>Нет аккаунта? <a href="#/register?next=${encodeURIComponent(next)}">Зарегистрируйтесь</a> — это бесплатно.</p>
          </form>
        </div>
      </div>`
    };
  });

  App.route('/register', function (ctx) {
    var next = nextPath(ctx.query);
    return {
      title: 'Регистрация',
      html: h`<div class="container page page-narrow">
        ${ui.pageHead({ crumbs: [['Регистрация']], title: 'Регистрация', lead: 'Аккаунт нужен, чтобы сохранять маршруты, планы и оставлять отзывы. Каталог и подбор работают и без него.' })}
        <form class="form card form-card" data-form="register" data-next="${next}" novalidate>
          ${ui.field({ name: 'name', label: 'Как к вам обращаться', required: true, autocomplete: 'given-name', id: 'reg-name', hint: 'От 2 до 60 символов. Будет видно в ваших отзывах' })}
          ${ui.field({ name: 'email', label: 'Электронная почта', type: 'email', required: true, autocomplete: 'email', inputmode: 'email', id: 'reg-email' })}
          ${ui.field({ name: 'password', label: 'Пароль', type: 'password', required: true, autocomplete: 'new-password', toggle: true, id: 'reg-password', hint: 'Не меньше 8 символов. Удобно использовать фразу из нескольких слов' })}
          ${ui.checks({ name: 'needs', legend: 'Что учитывать при подборе маршрутов', hint: 'Необязательно. Это сведения о здоровье — мы используем их только для подбора маршрутов, их можно изменить или удалить в любой момент', items: ui.needsItems(), array: true, icons: 'cat-', cls: 'checks-access' })}
          <label class="check check-consent"><input type="checkbox" name="consent" value="1" required aria-required="true" id="reg-consent"><span>Я соглашаюсь на обработку персональных данных, включая отмеченные сведения о потребностях, на условиях <a href="#/privacy">политики обработки данных</a><span class="req" aria-hidden="true"> *</span></span></label>
          <div class="form-actions"><button type="submit" class="btn btn-primary btn-block">Создать аккаунт</button></div>
          <p>Уже есть аккаунт? <a href="#/login?next=${encodeURIComponent(next)}">Войдите</a>.</p>
        </form>
      </div>`
    };
  });

  App.form('login', async function (form, d) {
    var body = { email: d.email, password: d.password, remember: !!d.remember };
    App.forms.check(form, 'login', body);
    var me = await App.api.post('auth/login', body);
    App.setMe(me);
    App.toast('Здравствуйте, ' + me.user.name + '!', 'ok');
    App.go(form.getAttribute('data-next'));
  });
  App.form('register', async function (form, d) {
    var body = { name: d.name, email: d.email, password: d.password, needs: d.needs || [], consent: !!d.consent };
    App.forms.check(form, 'register', body);
    var me = await App.api.post('auth/register', body);
    App.setMe(me);
    App.toast('Аккаунт создан. Добро пожаловать!', 'ok');
    App.go(form.getAttribute('data-next'));
  });
})();
