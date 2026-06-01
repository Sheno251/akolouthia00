if(!localStorage.getItem('isAdmin')){ location.href='/admin/login.html'; }
async function loadAll(){
  const kinds=['articles','books','meetings'];
  const container = document.getElementById('lists');
  container.innerHTML='';
  for(const k of kinds){
    const res = await fetch('/api/'+k);
    const items = await res.json();
    const div = document.createElement('div'); div.innerHTML = `<h3>${k}</h3>`;
    if(!items.length){ div.innerHTML += '<p>لا يوجد</p>'; container.appendChild(div); continue; }
    const ul = document.createElement('ul');
    for(const it of items){
      const li = document.createElement('li');
      li.innerHTML = `<strong>${it.title}</strong> <small>${it.date||''}</small>
      <div><button onclick="edit('${k}','${it.id}')">تعديل</button> <button onclick="del('${k}','${it.id}')">حذف</button></div>`;
      ul.appendChild(li);
    }
    div.appendChild(ul); container.appendChild(div);
  }
}
function clearForm(){ document.getElementById('title').value=''; document.getElementById('text').value=''; document.getElementById('date').value=''; document.getElementById('itemId').value=''; }
async function save(){
  const kind = document.getElementById('kind').value;
  const id = document.getElementById('itemId').value;
  const fd = new FormData();
  fd.append('title', document.getElementById('title').value);
  fd.append('text', document.getElementById('text').value);
  fd.append('date', document.getElementById('date').value);
  const img = document.getElementById('image').files[0];
  const file = document.getElementById('file').files[0];
  if(img) fd.append('image', img);
  if(file) fd.append('file', file);
  let url = '/api/'+kind;
  let method = 'POST';
  if(id){ url += '/'+id; method='PUT'; }
  const res = await fetch(url, { method, body: fd });
  if(res.ok){ document.getElementById('msg').innerText='تم الحفظ'; loadAll(); clearForm(); } else { alert('خطأ'); }
}
async function edit(kind,id){
  const res = await fetch('/api/'+kind);
  const items = await res.json();
  const it = items.find(x=>x.id==id);
  document.getElementById('kind').value = kind;
  document.getElementById('title').value = it.title;
  document.getElementById('text').value = it.text;
  document.getElementById('date').value = it.date;
  document.getElementById('itemId').value = id;
  window.scrollTo({top:0,behavior:'smooth'});
}
async function del(kind,id){ if(!confirm('تأكيد الحذف؟')) return; await fetch('/api/'+kind+'/'+id, { method:'DELETE' }); loadAll(); }
document.addEventListener('DOMContentLoaded', loadAll);
