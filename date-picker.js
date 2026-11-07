/* One compact date selector for Safari and desktop; form values remain ISO dates. */
(() => {
  'use strict';
  const W = globalThis.LawyerWorkflow;
  const calendarIcon = '<svg class="icon" aria-hidden="true"><use href="#i-calendar"></use></svg>';
  const arrow = direction => `<svg class="icon" aria-hidden="true"><use href="#i-arrow-${direction}"></use></svg>`;
  const pad = n => String(n).padStart(2,'0');
  const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const parse = value => new Date(value+'T12:00:00');
  const pretty = value => W.validDay(value) ? value.split('-').reverse().join('.') : 'Выбрать дату';
  const popup = document.createElement('section');
  popup.id='datePicker';popup.className='overlay j-date-overlay';popup.setAttribute('role','dialog');popup.setAttribute('aria-modal','true');popup.setAttribute('aria-labelledby','datePickerTitle');popup.setAttribute('aria-hidden','true');
  document.body.append(popup);
  let activeInput=null, activeButton=null, view=new Date(), focusDay='';
  function syncButton(input, button) {
    button.querySelector('[data-date-text]').textContent=pretty(input.value);
    button.classList.toggle('is-empty',!input.value);
    button.setAttribute('aria-label',`${button.dataset.dateLabel}: ${input.value?pretty(input.value):'выбрать дату'}`);
  }
  function enhance(root) {
    root.querySelectorAll('input[type="date"]').forEach(input => {
      const label=root.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      const button=document.createElement('button');button.type='button';button.className='j-date-trigger';button.id=input.id+'-trigger';button.dataset.dateOpen=input.id;button.dataset.dateLabel=label?.textContent||'Дата';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','datePicker');button.setAttribute('aria-expanded','false');
      button.innerHTML=`<span data-date-text></span>${calendarIcon}`;
      input.type='hidden';input.dataset.dateField='true';input.after(button);if(label)label.htmlFor=button.id;
      syncButton(input,button);
      input.addEventListener('change',()=>syncButton(input,button));
    });
  }
  function draw(focusValue='') {
    const selected=activeInput?.value||'',today=dateKey(new Date()),year=view.getFullYear(),month=view.getMonth();
    popup.dataset.month=`${year}-${pad(month+1)}`;
    const days=W.monthDays(year,month);
    const tabDay=days.includes(focusDay)?focusDay:days.includes(selected)?selected:days.includes(today)?today:days.find(Boolean);
    popup.innerHTML=`<div class="sheet j-date-picker"><header class="j-date-title"><h2 id="datePickerTitle">${esc(activeButton.dataset.dateLabel)}</h2><button type="button" class="j-icon" data-date-close aria-label="Закрыть календарь"><svg class="icon" aria-hidden="true"><use href="#i-close"></use></svg></button></header><div class="j-date-month"><button type="button" class="j-icon" data-date-prev aria-label="Предыдущий месяц" ${year===100&&month===0?'disabled':''}>${arrow('left')}</button><strong>${esc(view.toLocaleDateString('ru-RU',{month:'long',year:'numeric'}))}</strong><button type="button" class="j-icon" data-date-next aria-label="Следующий месяц" ${year===9999&&month===11?'disabled':''}>${arrow('right')}</button></div><div class="j-date-grid" role="group" aria-label="Дни месяца">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(day=>`<span aria-hidden="true">${day}</span>`).join('')}${days.map(day=>day?`<button type="button" data-date-value="${day}" tabindex="${day===tabDay?0:-1}" class="j-date-day${day===selected?' is-selected':''}${day===today?' is-today':''}" aria-label="${esc(parse(day).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}))}" aria-pressed="${day===selected}" ${day===today?'aria-current="date"':''}>${parse(day).getDate()}</button>`:'<span aria-hidden="true"></span>').join('')}</div><footer class="j-date-footer">${activeInput.required?'<span></span>':'<button type="button" class="j-text" data-date-clear>Без даты</button>'}<button type="button" class="j-text" data-date-today>Сегодня</button></footer></div>`;
    if(focusValue)popup.querySelector(`[data-date-value="${focusValue}"]`)?.focus({preventScroll:true});
  }
  function close(){hideOverlay(popup);activeButton?.setAttribute('aria-expanded','false');}
  function choose(value){
    if(!activeInput?.isConnected||!activeButton?.isConnected){close();return;}
    if(value&&!W.validDay(value))return;
    if(!value&&activeInput.required)return;
    activeInput.value=value;syncButton(activeInput,activeButton);
    activeInput.dispatchEvent(new Event('input',{bubbles:true}));activeInput.dispatchEvent(new Event('change',{bubbles:true}));close();
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-date-open]');if(!button)return;
    const input=document.getElementById(button.dataset.dateOpen);if(!input)return;
    activeInput=input;activeButton=button;view=W.validDay(input.value)?parse(input.value):new Date();view.setDate(1);focusDay=input.value;
    draw();showOverlay(popup);button.setAttribute('aria-expanded','true');
    requestAnimationFrame(()=>popup.querySelector('.j-date-day[tabindex="0"]')?.focus({preventScroll:true}));
  });
  popup.addEventListener('click',event=>{
    if(event.target.closest('[data-date-close]')){close();return;}
    if(event.target.closest('[data-date-clear]')){choose('');return;}
    if(event.target.closest('[data-date-today]')){choose(dateKey(new Date()));return;}
    const day=event.target.closest('[data-date-value]');if(day){choose(day.dataset.dateValue);return;}
    const previous=event.target.closest('[data-date-prev]'),next=event.target.closest('[data-date-next]');
    if(previous||next){view.setMonth(view.getMonth()+(next?1:-1));focusDay='';draw();popup.querySelector(next?'[data-date-next]':'[data-date-prev]')?.focus({preventScroll:true});}
  });
  popup.addEventListener('keydown',event=>{
    const day=event.target.closest('[data-date-value]');if(!day||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    event.preventDefault();const value=parse(day.dataset.dateValue),offset=(value.getDay()+6)%7;
    const amount={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-offset,End:6-offset}[event.key];value.setDate(value.getDate()+amount);
    if(value.getFullYear()<100||value.getFullYear()>9999)return;
    focusDay=dateKey(value);view=new Date(value.getFullYear(),value.getMonth(),1,12);draw(focusDay);
  });
  new MutationObserver(()=>{if(!popup.classList.contains('show'))activeButton?.setAttribute('aria-expanded','false');}).observe(popup,{attributes:true,attributeFilter:['class']});
  globalThis.DateFields={enhance};
})();
