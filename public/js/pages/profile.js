/** Личный кабинет: потребности, избранное, пройденные, отзывы, смена пароля, выгрузка и удаление данных */
(function () {
  'use strict';
  var App = window.App, h = App.html, ui = App.ui, L = App.L, D = App.D, S = App.state;

  App.route('/profile', async function () {
    var u = S.user;
    var res = await Promise.all([App.api.get('me/reviews'), App.api.get('plans'), S.user ? App.api.get('gear-lists') : { items: [] }]);
    var reviews = res[0].items, plans = res[1].items, lists = res[2].items;
    var favs = S.favorites.map(ui.routeBySlug).filter(Boolean);
    var done = S.completed.map(function (c) { return { r: ui.routeBySlug(c.slug), at: c.doneAt }; }).filter(function (x) { return x.r; });
    var km = done.reduce(function (s, x) { return s + x.r.lengthKm; }, 0);
    return {
      title: 'Личный кабинет',
      html: h`<div class="container page">
        ${ui.pageHead({ crumbs: [['Личный кабинет']], title: 'Здравствуйте, ' + u.name + '!', lead: h`${u.email}${u.role === 'admin' ? h` · <span class="badge badge-info">администратор</span>` : ''} · с нами с ${ui.date(u.createdAt)}` })}
        <div class="row">
          ${u.role === 'admin' ? h`<a class="btn btn-primary" href="#/admin">${App.icon('lock')}Администрирование</a>` : ''}
          <a class="btn btn-secondary" href="#/plans">${App.icon('flag')}Мои походы</a>
          <button type="button" class="btn btn-ghost" data-action="logout">${App.icon('logout')}Выйти</button>
        </div>
        <ul class="stat-tiles stat-tiles-sm" aria-label="Ваша статистика">
          <li><strong>${favs.length}</strong><span>в избранном</span></li>
          <li><strong>${done.length}</strong><span>${L.plural(done.length, ['маршрут пройден', 'маршрута пройдено', 'маршрутов пройдено'])}</span></li>
          <li><strong>${L.num(Math.round(km * 10) / 10)}</strong><span>км по тропам</span></li>
          <li><strong>${plans.length}</strong><span>${L.plural(plans.length, ['план похода', 'плана похода', 'планов походов'])}</span></li>
          <li><strong>${reviews.length}</strong><span>${L.plural(reviews.length, ['отзыв', 'отзыва', 'отзывов'])}</span></li>
        </ul>

        <section class="section" aria-labelledby="needs-t">
          <h2 id="needs-t" class="section-title">Что учитывать при подборе</h2>
          <form class="form card form-card" data-form="profile" novalidate>
            ${ui.field({ name: 'name', label: 'Имя', required: true, value: u.name, autocomplete: 'given-name', id: 'pf-name' })}
            ${ui.checks({ name: 'needs', legend: 'Мои потребности', hint: 'Будут подставляться в каталог и подбор. Сведения о здоровье — только с вашего согласия, их можно удалить', items: ui.needsItems(), values: u.needs, array: true, icons: 'cat-', cls: 'checks-access' })}
            <label class="check"><input type="checkbox" name="companion" value="1"${App.on(u.companion, 'checked')}><span>Обычно хожу с помощником<small>Показывать маршруты, доступные с сопровождающим</small></span></label>
            <div class="form-actions"><button type="submit" class="btn btn-primary">Сохранить</button></div>
          </form>
        </section>

        <section class="section" aria-labelledby="fav-t">
          <h2 id="fav-t" class="section-title">Избранное</h2>
          ${favs.length ? h`<ul class="grid-cards">${favs.map(function (r) { return h`<li>${ui.routeCard(r, { needs: u.needs })}</li>`; })}</ul>`
            : ui.empty('В избранном пока пусто', 'Нажимайте «В избранное» на карточках маршрутов.', h`<a class="btn btn-secondary" href="#/routes">Открыть каталог</a>`)}
        </section>

        <section class="section" aria-labelledby="done-t">
          <h2 id="done-t" class="section-title">Пройденные маршруты</h2>
          ${done.length ? h`<ul class="simple-list">${done.map(function (x) { return h`<li><a href="#/routes/${x.r.slug}">${x.r.title}</a> <span class="muted small">— ${ui.date(x.at)}, ${L.km(x.r.lengthKm)}</span></li>`; })}</ul>`
            : h`<p class="muted">Отмечайте пройденные маршруты кнопкой «Отметить пройденным» на странице маршрута.</p>`}
        </section>

        <section class="section" aria-labelledby="rev-t">
          <h2 id="rev-t" class="section-title">Мои отзывы</h2>
          ${reviews.length ? h`<ul class="simple-list">${reviews.map(function (v) {
            return h`<li><a href="#/routes/${v.routeSlug}?focus=reviews">${v.routeTitle}</a> — ${ui.stars(v.rating)}${v.status === 'hidden' ? h` <span class="badge badge-warn">скрыт модератором</span>` : ''}<p class="small">${v.text}</p></li>`;
          })}</ul>` : h`<p class="muted">Вы ещё не оставляли отзывов.</p>`}
        </section>

        ${lists.length ? h`<section class="section" aria-labelledby="gl-t"><h2 id="gl-t" class="section-title">Списки снаряжения</h2>
          <ul class="simple-list">${lists.map(function (g) { return h`<li><a href="#/gear?list=${g.id}">${g.title}</a> <span class="muted small">— ${App.count(g.items.length, ['предмет', 'предмета', 'предметов'])}</span></li>`; })}</ul></section>` : ''}

        <section class="section" aria-labelledby="sec-t">
          <h2 id="sec-t" class="section-title">Безопасность</h2>
          <form class="form card form-card" data-form="password" novalidate>
            <h3>Сменить пароль</h3>
            ${ui.field({ name: 'current', label: 'Текущий пароль', type: 'password', required: true, autocomplete: 'current-password', toggle: true, id: 'pw-cur' })}
            ${ui.field({ name: 'next', label: 'Новый пароль', type: 'password', required: true, autocomplete: 'new-password', toggle: true, id: 'pw-next', hint: 'Не меньше 8 символов' })}
            <div class="form-actions"><button type="submit" class="btn btn-primary">Сменить пароль</button></div>
          </form>
        </section>

        <section class="section" aria-labelledby="data-t">
          <h2 id="data-t" class="section-title">Мои данные</h2>
          <p>Вы можете выгрузить все свои данные или удалить аккаунт — вместе с отзывами, планами и списками (152-ФЗ, ст. 14 и 21).</p>
          <div class="row">
            <button type="button" class="btn btn-secondary" data-action="export">${App.icon('download')}Выгрузить данные (JSON)</button>
            <button type="button" class="btn btn-danger" data-action="delete-account">${App.icon('trash')}Удалить аккаунт</button>
            ${App.api.mode === 'local' ? h`<button type="button" class="btn btn-ghost" data-action="reset-demo">Сбросить демо-базу браузера</button>` : ''}
          </div>
        </section>
      </div>`
    };
  }, { auth: true, title: 'Войдите в личный кабинет' });

  App.form('profile', async function (form, d) {
    var body = { name: d.name, needs: d.needs || [], companion: !!d.companion };
    App.forms.check(form, 'profile', body);
    var me = await App.api.patch('me', body);
    App.setMe(me);
    App.toast('Сохранено', 'ok');
  });
  App.form('password', async function (form, d) {
    var body = { current: d.current, next: d.next };
    App.forms.check(form, 'password', body);
    await App.api.post('me/password', body);
    form.reset();
    App.toast('Пароль изменён. Другие сеансы завершены.', 'ok');
  });
  App.actions({
    export: function () { App.api.download('me/export', 'tropy-my-data.json').catch(function (e) { App.toast(e.message, 'bad'); }); },
    'delete-account': async function () {
      var pass = await App.confirm({ title: 'Удалить аккаунт?', text: 'Будут удалены профиль, избранное, отзывы, планы и списки. Это действие нельзя отменить. Для подтверждения введите пароль.', ok: 'Удалить навсегда', danger: true, password: true });
      if (pass === false) return;
      try {
        await App.api.del('me', { password: pass });
        App.setMe({ user: null });
        App.toast('Аккаунт удалён');
        App.go('/');
      } catch (e) { App.toast(e.fields && e.fields.password ? e.fields.password : e.message, 'bad'); }
    },
    'reset-demo': async function () {
      if (!(await App.confirm({ title: 'Сбросить демо-базу?', text: 'Все аккаунты, планы и отзывы в этом браузере будут удалены, демо-пользователи — созданы заново.', ok: 'Сбросить', danger: true }))) return;
      await App.api.resetLocal();
      App.setMe({ user: null });
      await App.loadRoutes();
      App.toast('Демо-база сброшена');
      App.go('/');
    }
  });
})();
