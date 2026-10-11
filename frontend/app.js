// Konfigurasi Supabase. Publishable key aman dipakai di sisi client,
// asalkan Row Level Security aktif (lihat backend/schema.sql).
window.COOKIEHOUSE_CONFIG = {
  url: 'https://bxkksyumysustlqyagqd.supabase.co',
  key: 'sb_publishable_9NQjWmbM341U4DkC0LIy7Q_GDWoyyUy'
};

// Lapisan data: memanggil Supabase (PostgREST) lewat fetch.
// Aplikasi memakai camelCase, database memakai snake_case; dipetakan di sini.
(function () {
  const CFG = window.COOKIEHOUSE_CONFIG;
  const TABLES = ['produk', 'pelanggan', 'penjualan', 'pengeluaran'];

  async function sb(path, { method = 'GET', body, returning = false } = {}) {
    const headers = { apikey: CFG.key, 'Content-Type': 'application/json' };
    if (returning) headers.Prefer = 'return=representation';
    const res = await fetch(`${CFG.url}/rest/v1/${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (!res.ok) throw new Error((data && (data.message || data.hint)) || res.statusText || 'Request gagal');
    return data;
  }

  const num = (v) => (v === null || v === undefined ? v : Number(v));

  const map = {
    produk: {
      from: (r) => ({ id: num(r.id), nama: r.nama, kategori: r.kategori, harga: num(r.harga), stok: num(r.stok), minStok: num(r.min_stok), emoji: r.emoji }),
      to: (o) => ({ nama: o.nama, kategori: o.kategori, harga: o.harga, stok: o.stok, min_stok: o.minStok, emoji: o.emoji })
    },
    pelanggan: {
      from: (r) => ({ id: num(r.id), nama: r.nama, hp: r.hp || '', email: r.email || '', alamat: r.alamat || '' }),
      to: (o) => ({ nama: o.nama, hp: o.hp, email: o.email, alamat: o.alamat })
    },
    penjualan: {
      from: (r) => ({ id: num(r.id), tanggal: r.tanggal, pelangganId: num(r.pelanggan_id), produkId: num(r.produk_id), qty: num(r.qty), harga: num(r.harga), total: num(r.total), metode: r.metode, catatan: r.catatan || '' }),
      to: (o) => ({ tanggal: o.tanggal, pelanggan_id: o.pelangganId, produk_id: o.produkId, qty: o.qty, harga: o.harga, metode: o.metode, catatan: o.catatan || '' })
    },
    pengeluaran: {
      from: (r) => ({ id: num(r.id), tanggal: r.tanggal, keterangan: r.keterangan, kategori: r.kategori, nominal: num(r.nominal), metode: r.metode }),
      to: (o) => ({ tanggal: o.tanggal, keterangan: o.keterangan, kategori: o.kategori, nominal: o.nominal, metode: o.metode })
    }
  };

  window.api = {
    async loadAll() {
      const rows = await Promise.all(TABLES.map((t) => sb(`${t}?select=*&order=id.asc`)));
      const db = {};
      TABLES.forEach((t, i) => { db[t] = rows[i].map(map[t].from); });
      return db;
    },
    insert: (type, obj) => sb(type, { method: 'POST', body: map[type].to(obj) }),
    // JSON.stringify membuang field undefined, jadi update parsial (mis. hanya stok) aman
    update: (type, id, obj) => sb(`${type}?id=eq.${Number(id)}`, { method: 'PATCH', body: map[type].to(obj) }),
    remove: (type, id) => sb(`${type}?id=eq.${Number(id)}`, { method: 'DELETE' }),

    // Hapus semua data. Penjualan dulu agar stok dikembalikan oleh trigger.
    async clearAll() {
      for (const t of ['penjualan', 'pengeluaran', 'pelanggan', 'produk']) {
        await sb(`${t}?id=gt.0`, { method: 'DELETE' });
      }
    },

    // Pulihkan dari backup JSON. ID baru dibuat database, relasi dipetakan ulang.
    async restoreAll(d) {
      await this.clearAll();
      const sold = {};
      d.penjualan.forEach((s) => { sold[s.produkId] = (sold[s.produkId] || 0) + Number(s.qty || 0); });

      // stok awal = stok backup + jumlah terjual, karena trigger akan mengurangi saat penjualan dimasukkan
      const prodRows = d.produk.map((p) => map.produk.to(Object.assign({}, p, { stok: Number(p.stok) + (sold[p.id] || 0) })));
      const newProd = prodRows.length ? await sb('produk', { method: 'POST', body: prodRows, returning: true }) : [];
      const pm = {}; d.produk.forEach((p, i) => { pm[p.id] = newProd[i].id; });

      const custRows = d.pelanggan.map((c) => map.pelanggan.to(c));
      const newCust = custRows.length ? await sb('pelanggan', { method: 'POST', body: custRows, returning: true }) : [];
      const cm = {}; d.pelanggan.forEach((c, i) => { cm[c.id] = newCust[i].id; });

      const exp = d.pengeluaran.map((x) => map.pengeluaran.to(x));
      if (exp.length) await sb('pengeluaran', { method: 'POST', body: exp });

      const sales = d.penjualan.filter((s) => pm[s.produkId]).map((s) =>
        map.penjualan.to(Object.assign({}, s, { produkId: pm[s.produkId], pelangganId: cm[s.pelangganId] || null })));
      if (sales.length) await sb('penjualan', { method: 'POST', body: sales });
    }
  };
})();


// ===== Logika & tampilan aplikasi =====
const todayISO=()=>new Date().toLocaleDateString('en-CA');
const dateNow=todayISO();
let db={produk:[],pelanggan:[],penjualan:[],pengeluaran:[]}, formType='', editingId=null;
async function refresh(){db=await api.loadAll();renderAll()}
async function run(job,okMsg){try{await job();await refresh();if(okMsg)toast(okMsg);return true}catch(e){console.error(e);toast('Gagal: '+(e.message||e));return false}}
async function init(){renderAll();try{await refresh()}catch(e){console.error(e);toast('Gagal terhubung ke Supabase: '+(e.message||e))}}
const rupiah=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n)||0);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const idLabel=(type,id)=>({produk:'PR',pelanggan:'PL',penjualan:'PJ',pengeluaran:'PG'}[type])+String(id).padStart(4,'0');
const byId=(type,id)=>db[type].find(x=>x.id===Number(id));
const totalSale=x=>Number(x.total??(x.qty*x.harga));
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(window._toastTimer);window._toastTimer=setTimeout(()=>t.classList.remove('show'),2800)}
function showPage(id,el){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===id));document.querySelectorAll('.nav button[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===id));const titles={dashboard:['Dashboard','Ringkasan bisnis CookieHouse hari ini.'],produk:['Produk & Persediaan','Kelola katalog, harga, dan stok.'],pelanggan:['Pelanggan','Database pelanggan CookieHouse.'],penjualan:['Penjualan','Transaksi terhubung ke produk dan pelanggan.'],pengeluaran:['Pengeluaran','Catatan biaya operasional bisnis.'],laporan:['Laporan Bisnis','Analisis performa bisnis CookieHouse.'],pengaturan:['Data & Backup','Kelola backup dan data database.']};document.getElementById('pageTitle').textContent=titles[id][0];document.getElementById('pageSubtitle').textContent=titles[id][1];renderAll()}
function nextId(type){return Math.max(0,...db[type].map(x=>Number(x.id)||0))+1}
function emptyRow(n,msg='Belum ada data.'){return `<tr><td colspan="${n}" class="empty">${msg}</td></tr>`}
function actionButtons(type,id){return `<div class="actions"><button class="btn btn-light btn-sm" onclick="editData('${type}',${id})">Edit</button><button class="btn btn-danger btn-sm" onclick="deleteData('${type}',${id})">Hapus</button></div>`}
function monthKey(d){return String(d||'').slice(0,7)}
function renderDashboard(){
 const sales=db.penjualan.reduce((s,x)=>s+totalSale(x),0), expenses=db.pengeluaran.reduce((s,x)=>s+Number(x.nominal),0);
 const todaySales=db.penjualan.filter(x=>x.tanggal===dateNow), monthExp=db.pengeluaran.filter(x=>monthKey(x.tanggal)===dateNow.slice(0,7)).reduce((s,x)=>s+Number(x.nominal),0);
 const stockUnits=db.produk.reduce((s,p)=>s+Number(p.stok),0),stockVal=db.produk.reduce((s,p)=>s+Number(p.stok)*Number(p.harga),0);
 document.getElementById('todaySales').textContent=rupiah(todaySales.reduce((s,x)=>s+totalSale(x),0));document.getElementById('todaySalesCount').textContent=todaySales.length+' transaksi hari ini';
 document.getElementById('monthExpense').textContent=rupiah(monthExp);document.getElementById('netProfit').textContent=rupiah(sales-expenses);document.getElementById('stockValue').textContent=rupiah(stockVal);document.getElementById('stockUnits').textContent=stockUnits+' pcs tersedia';
 document.getElementById('recentSales').innerHTML=db.penjualan.slice().sort((a,b)=>(b.tanggal+b.id)-(a.tanggal+a.id)).slice(0,5).map(s=>{let c=byId('pelanggan',s.pelangganId),p=byId('produk',s.produkId);return `<div class="recent-item"><div><strong>${esc(c?.nama||'Pelanggan tidak tersedia')}</strong><small>${esc(p?.nama||'Produk tidak tersedia')} · ${esc(s.tanggal)} · ${s.qty} pcs</small></div><div class="money green">${rupiah(totalSale(s))}</div></div>`}).join('')||'<div class="empty">Belum ada penjualan.</div>';
 const low=db.produk.filter(p=>p.stok<=p.minStok),out=db.produk.filter(p=>p.stok===0),alerts=[];
 out.forEach(p=>alerts.push({title:p.nama,desc:'Stok habis · perlu restock segera'}));low.filter(p=>p.stok>0).forEach(p=>alerts.push({title:p.nama,desc:`Stok tinggal ${p.stok} pcs · batas minimum ${p.minStok}`}));if(!db.produk.length)alerts.push({title:'Belum ada produk',desc:'Tambahkan produk pertama untuk mulai berjualan.'});if(!db.pelanggan.length)alerts.push({title:'Belum ada pelanggan',desc:'Tambahkan pelanggan agar bisa dicatat saat penjualan.'});
 document.getElementById('alertCount').textContent=alerts.length+' alert';document.getElementById('alerts').innerHTML=alerts.slice(0,5).map(a=>`<div class="alert-item"><span class="alert-dot"></span><div><strong>${esc(a.title)}</strong><small>${esc(a.desc)}</small></div></div>`).join('')||'<div class="empty">✨ Semua aman, tidak ada peringatan stok.</div>';
}
function renderProducts(){
 const q=(document.getElementById('searchProduk')?.value||'').toLowerCase(),filter=document.getElementById('filterStok')?.value||'';
 const arr=db.produk.filter(p=>(p.nama+' '+p.id+' '+p.kategori).toLowerCase().includes(q)).filter(p=>filter==='low'?p.stok<=p.minStok:filter==='available'?p.stok>p.minStok:filter==='empty'?p.stok===0:true);
 document.getElementById('productGrid').innerHTML=arr.map(p=>{const pct=Math.min(100,p.minStok>0?p.stok/Math.max(p.minStok*3,p.stok)*100:100);const stockClass=p.stok<=p.minStok?'low':'';return `<div class="product-card"><div class="product-emoji">${esc(p.emoji||'🍪')}</div><div class="td-sub">${idLabel('produk',p.id)} · ${esc(p.kategori||'Lainnya')}</div><h3>${esc(p.nama)}</h3><p>Harga jual per pcs</p><div class="product-meta"><span class="product-price">${rupiah(p.harga)}</span><span class="badge ${p.stok===0?'red':p.stok<=p.minStok?'gold':'green'}">${p.stok} pcs</span></div><div class="stock-meter"><span class="${stockClass}" style="width:${pct}%"></span></div><div class="product-meta"><span class="mini-note">Min. stok ${p.minStok} pcs</span><div class="actions"><button class="btn btn-light btn-sm" onclick="openStockAdjust(${p.id})">± Stok</button><button class="btn btn-light btn-sm" onclick="editData('produk',${p.id})">Edit</button><button class="btn btn-danger btn-sm" onclick="deleteData('produk',${p.id})">Hapus</button></div></div></div>`}).join('')||'<div class="card empty">Produk tidak ditemukan.</div>';
}
function renderCustomers(){
 const q=(document.getElementById('searchPelanggan')?.value||'').toLowerCase();
 const arr=db.pelanggan.filter(c=>(c.nama+' '+c.hp+' '+c.email+' '+c.id).toLowerCase().includes(q));
 document.getElementById('customerRows').innerHTML=arr.map(c=>{const ss=db.penjualan.filter(s=>s.pelangganId===c.id);return `<tr><td><span class="badge">${idLabel('pelanggan',c.id)}</span></td><td><div class="td-main">${esc(c.nama)}</div><div class="td-sub">${esc(c.alamat||'Alamat belum diisi')}</div></td><td>${esc(c.hp)}<div class="td-sub">${esc(c.email||'-')}</div></td><td>${ss.length} transaksi</td><td class="td-main">${rupiah(ss.reduce((s,x)=>s+totalSale(x),0))}</td><td>${actionButtons('pelanggan',c.id)}</td></tr>`}).join('')||emptyRow(6,'Pelanggan tidak ditemukan.');
}
function renderSales(){
 const q=(document.getElementById('searchPenjualan')?.value||'').toLowerCase(),from=document.getElementById('salesFrom')?.value||'',to=document.getElementById('salesTo')?.value||'';
 const arr=db.penjualan.filter(s=>{const p=byId('produk',s.produkId),c=byId('pelanggan',s.pelangganId);return (idLabel('penjualan',s.id)+' '+(p?.nama||'')+' '+(c?.nama||'')+' '+s.tanggal).toLowerCase().includes(q)&&(!from||s.tanggal>=from)&&(!to||s.tanggal<=to)}).slice().sort((a,b)=>b.id-a.id);
 document.getElementById('salesRows').innerHTML=arr.map(s=>{const p=byId('produk',s.produkId),c=byId('pelanggan',s.pelangganId);return `<tr><td><span class="badge">${idLabel('penjualan',s.id)}</span></td><td>${esc(s.tanggal)}</td><td><div class="td-main">${esc(c?.nama||'Pelanggan dihapus')}</div><div class="td-sub">${esc(s.metode||'Cash')}</div></td><td>${esc(p?.nama||'Produk dihapus')}</td><td>${s.qty}</td><td>${rupiah(s.harga)}</td><td class="td-main">${rupiah(totalSale(s))}</td><td>${actionButtons('penjualan',s.id)}</td></tr>`}).join('')||emptyRow(8,'Tidak ada transaksi yang cocok.');
}
function clearSalesFilter(){['searchPenjualan','salesFrom','salesTo'].forEach(id=>document.getElementById(id).value='');renderSales()}
function renderExpenses(){
 const q=(document.getElementById('searchPengeluaran')?.value||'').toLowerCase();
 const arr=db.pengeluaran.filter(x=>(x.keterangan+' '+x.kategori+' '+x.id+' '+x.tanggal).toLowerCase().includes(q)).slice().sort((a,b)=>b.id-a.id);
 document.getElementById('expenseRows').innerHTML=arr.map(x=>`<tr><td><span class="badge">${idLabel('pengeluaran',x.id)}</span></td><td>${esc(x.tanggal)}</td><td><div class="td-main">${esc(x.keterangan)}</div><div class="td-sub">${esc(x.metode||'Cash')}</div></td><td><span class="badge">${esc(x.kategori)}</span></td><td class="td-main red">${rupiah(x.nominal)}</td><td>${actionButtons('pengeluaran',x.id)}</td></tr>`).join('')||emptyRow(6,'Belum ada pengeluaran.');
}
function renderReports(){
 const sales=db.penjualan.reduce((s,x)=>s+totalSale(x),0),expenses=db.pengeluaran.reduce((s,x)=>s+Number(x.nominal),0);
 document.getElementById('reportSales').textContent=rupiah(sales);document.getElementById('reportSaleCount').textContent=db.penjualan.length+' transaksi';document.getElementById('reportExpenses').textContent=rupiah(expenses);document.getElementById('reportProfit').textContent=rupiah(sales-expenses);document.getElementById('avgSale').textContent=rupiah(db.penjualan.length?sales/db.penjualan.length:0);
 const prodStats=db.produk.map(p=>({name:p.nama,qty:db.penjualan.filter(s=>s.produkId===p.id).reduce((sum,s)=>sum+s.qty,0)})).sort((a,b)=>b.qty-a.qty).slice(0,5),maxP=Math.max(1,...prodStats.map(x=>x.qty));
 document.getElementById('topProducts').innerHTML=prodStats.map(x=>`<div class="bar-row"><span>${esc(x.name)}</span><div class="bar-track"><span style="width:${x.qty/maxP*100}%"></span></div><b>${x.qty} pcs</b></div>`).join('')||'<div class="empty">Belum ada data.</div>';
 const custStats=db.pelanggan.map(c=>({name:c.nama,total:db.penjualan.filter(s=>s.pelangganId===c.id).reduce((sum,s)=>sum+totalSale(s),0)})).sort((a,b)=>b.total-a.total).slice(0,5),maxC=Math.max(1,...custStats.map(x=>x.total));
 document.getElementById('topCustomers').innerHTML=custStats.map(x=>`<div class="bar-row"><span>${esc(x.name)}</span><div class="bar-track"><span style="width:${x.total/maxC*100}%"></span></div><b>${rupiah(x.total)}</b></div>`).join('')||'<div class="empty">Belum ada data.</div>';
 const cats={};db.pengeluaran.forEach(x=>cats[x.kategori]=(cats[x.kategori]||0)+Number(x.nominal));const entries=Object.entries(cats).sort((a,b)=>b[1]-a[1]),maxE=Math.max(1,...entries.map(x=>x[1]));
 document.getElementById('expenseBreakdown').innerHTML=entries.map(([k,v])=>`<div class="bar-row"><span>${esc(k)}</span><div class="bar-track"><span style="width:${v/maxE*100}%"></span></div><b>${rupiah(v)}</b></div>`).join('')||'<div class="empty">Belum ada pengeluaran.</div>';
}
function renderSettings(){document.getElementById('sideProductCount').textContent=db.produk.length+' produk terdaftar';document.getElementById('dbStatus').innerHTML=[['Produk',db.produk.length],['Pelanggan',db.pelanggan.length],['Penjualan',db.penjualan.length],['Pengeluaran',db.pengeluaran.length]].map(([n,v])=>`<div class="entity"><b>${n}</b><small>${v} data tersimpan<br>di Supabase</small></div>`).join('')}
function renderAll(){renderDashboard();renderProducts();renderCustomers();renderSales();renderExpenses();renderReports();renderSettings()}
const input=(id,label,type='text',extra='')=>`<div class="field"><label for="f_${id}">${label}</label><input id="f_${id}" name="${id}" type="${type}" ${extra} required></div>`;
const select=(id,label,opts)=>`<div class="field"><label for="f_${id}">${label}</label><select id="f_${id}" name="${id}" required>${opts}</select></div>`;
function openForm(type,data=null){
 formType=type;editingId=data?.id??null;
 const names={produk:'Produk',pelanggan:'Pelanggan',penjualan:'Penjualan',pengeluaran:'Pengeluaran'};
 document.getElementById('modalTitle').textContent=(data?'Edit ':'Tambah ')+names[type];
 document.getElementById('modalDesc').textContent=type==='penjualan'?'Pilih produk dan pelanggan yang sudah terdaftar.': 'Pastikan informasi yang dimasukkan sudah benar.';
 let f='';
 if(type==='produk')f=input('nama','Nama produk')+`<div class="form-grid">${input('kategori','Kategori')}${select('emoji','Ikon produk',['🍪','❤️','🍵','🍯','🥜','🧁','🍫'].map(e=>`<option value="${e}">${e}</option>`).join(''))}</div><div class="form-grid">${input('harga','Harga jual (Rp)','number','min="0" step="1"')}${input('stok','Stok awal (pcs)','number','min="0" step="1"')}</div>${input('minStok','Batas minimum stok','number','min="0" step="1')}`;
 if(type==='pelanggan')f=input('nama','Nama pelanggan')+`<div class="form-grid">${input('hp','Nomor HP','tel')}${input('email','Email','email')}</div>`+input('alamat','Kota / alamat','text');
 if(type==='penjualan'){
  if(!db.produk.length||!db.pelanggan.length){toast('Tambahkan produk dan pelanggan terlebih dahulu.');return}
  f=input('tanggal','Tanggal penjualan','date')+select('pelangganId','Pelanggan',db.pelanggan.map(c=>`<option value="${c.id}">${esc(c.nama)} · ${idLabel('pelanggan',c.id)}</option>`).join(''))+select('produkId','Produk',db.produk.map(p=>`<option value="${p.id}">${esc(p.nama)} · ${rupiah(p.harga)} · stok ${p.stok}</option>`).join(''))+`<div class="form-grid">${input('qty','Jumlah terjual (pcs)','number','min="1" step="1"')}${select('metode','Metode pembayaran',['Cash','QRIS','Transfer','Debit'].map(x=>`<option>${x}</option>`).join(''))}</div><div class="field"><label>Ringkasan harga</label><div id="salePreview" class="badge">Pilih produk dan jumlah untuk menghitung total.</div><small>Harga transaksi disimpan sebagai snapshot, sehingga riwayat tetap sama jika harga katalog berubah.</small></div><div class="field"><label for="f_catatan">Catatan (opsional)</label><input id="f_catatan" name="catatan" placeholder="Contoh: pesanan khusus"></div>`;
 }
 if(type==='pengeluaran')f=input('tanggal','Tanggal','date')+input('keterangan','Keterangan')+select('kategori','Kategori',['Bahan baku','Kemasan','Operasional','Transportasi','Gaji','Lainnya'].map(x=>`<option>${x}</option>`).join())+`<div class="form-grid">${input('nominal','Nominal (Rp)','number','min="1" step="1"')}${select('metode','Metode pembayaran',['Cash','QRIS','Transfer','Debit'].map(x=>`<option>${x}</option>`).join())}</div>`;
 document.getElementById('fields').innerHTML=f;
 if(data)Object.entries(data).forEach(([k,v])=>{const el=document.getElementById('f_'+k);if(el)el.value=v});
 else{const d=document.getElementById('f_tanggal');if(d)d.value=dateNow;const e=document.getElementById('f_emoji');if(e)e.value='🍪';const m=document.getElementById('f_minStok');if(m)m.value=5}
 if(type==='penjualan'){
  const updatePreview=()=>{const p=byId('produk',document.getElementById('f_produkId')?.value),qty=Number(document.getElementById('f_qty')?.value||0);const el=document.getElementById('salePreview');if(el)el.textContent=p?`${rupiah(p.harga)} × ${qty||0} = ${rupiah(p.harga*(qty||0))} · Stok tersedia: ${p.stok}`:''};
  document.getElementById('f_produkId').addEventListener('change',updatePreview);document.getElementById('f_qty').addEventListener('input',updatePreview);updatePreview();
 }
 document.getElementById('modal').classList.add('show');
}
function closeForm(){document.getElementById('modal').classList.remove('show');document.getElementById('dataForm').reset();editingId=null}
function editData(type,id){const d=byId(type,id);if(!d)return;if(type==='penjualan'){toast('Untuk menjaga stok akurat, edit transaksi penjualan melalui hapus lalu catat ulang.');return}openForm(type,{...d})}
async function deleteData(type,id){
 const x=byId(type,id);if(!x)return;
 if(type==='produk'&&db.penjualan.some(s=>s.produkId===id)){toast('Produk masih dipakai dalam riwayat penjualan. Hapus transaksi terkait terlebih dahulu.');return}
 if(type==='pelanggan'&&db.penjualan.some(s=>s.pelangganId===id)){toast('Pelanggan masih terhubung dengan penjualan. Riwayat transaksi perlu dihapus terlebih dahulu.');return}
 if(!confirm(`Hapus ${idLabel(type,id)}? Tindakan ini tidak bisa dibatalkan.`))return;
 await run(()=>api.remove(type,id),'Data berhasil dihapus. Stok disesuaikan jika diperlukan.');
}
document.getElementById('dataForm').addEventListener('submit',async e=>{
 e.preventDefault();const v=Object.fromEntries(new FormData(e.target).entries());
 const num=(k)=>Number(v[k]);const eid=editingId,type=formType;
 const save=(obj)=>eid!==null?api.update(type,eid,obj):api.insert(type,obj);
 let job;
 if(type==='produk'){
  const obj={nama:v.nama.trim(),kategori:v.kategori.trim()||'Lainnya',emoji:v.emoji||'🍪',harga:num('harga'),stok:num('stok'),minStok:num('minStok')};
  if(!obj.nama||obj.harga<0||obj.stok<0||obj.minStok<0){toast('Periksa nama, harga, dan stok.');return}
  job=()=>save(obj);
 }else if(type==='pelanggan'){
  const obj={nama:v.nama.trim(),hp:v.hp.trim(),email:v.email.trim(),alamat:v.alamat.trim()};
  if(!obj.nama||!obj.hp){toast('Nama dan nomor HP wajib diisi.');return}
  job=()=>save(obj);
 }else if(type==='pengeluaran'){
  const obj={tanggal:v.tanggal,keterangan:v.keterangan.trim(),kategori:v.kategori,nominal:num('nominal'),metode:v.metode};
  if(!obj.tanggal||!obj.keterangan||obj.nominal<=0){toast('Tanggal, keterangan, dan nominal wajib valid.');return}
  job=()=>save(obj);
 }else if(type==='penjualan'){
  const pid=num('produkId'),qty=num('qty'),p=byId('produk',pid),cid=num('pelangganId');
  if(!p||!byId('pelanggan',cid)||!v.tanggal||qty<1||!Number.isInteger(qty)){toast('Data penjualan belum valid.');return}
  if(p.stok<qty){toast(`Stok ${p.nama} tidak cukup. Tersedia ${p.stok} pcs.`);return}
  // stok dikurangi otomatis oleh trigger di database
  job=()=>api.insert('penjualan',{tanggal:v.tanggal,pelangganId:cid,produkId:pid,qty,harga:Number(p.harga),metode:v.metode||'Cash',catatan:(v.catatan||'').trim()});
 }
 closeForm();await run(job,'Data berhasil disimpan dan seluruh ringkasan diperbarui.');
});
async function openStockAdjust(id){const p=byId('produk',id);if(!p)return;const raw=prompt(`Penyesuaian stok untuk ${p.nama}\nStok saat ini: ${p.stok} pcs\nMasukkan perubahan stok (contoh: 10 untuk tambah, -3 untuk kurangi):`);if(raw===null)return;const delta=Number(raw);if(!Number.isInteger(delta)||delta===0){toast('Masukkan bilangan bulat selain nol.');return}if(p.stok+delta<0){toast('Stok tidak bisa menjadi negatif.');return}await run(()=>api.update('produk',id,{stok:p.stok+delta}),'Stok berhasil disesuaikan.')}
function exportCSV(type){
 let rows=[],filename=type;
 if(type==='produk')rows=[['ID','Nama Produk','Kategori','Harga','Stok','Minimum Stok'],...db.produk.map(x=>[idLabel(type,x.id),x.nama,x.kategori,x.harga,x.stok,x.minStok])];
 if(type==='pelanggan')rows=[['ID','Nama','HP','Email','Alamat'],...db.pelanggan.map(x=>[idLabel(type,x.id),x.nama,x.hp,x.email,x.alamat])];
 if(type==='penjualan')rows=[['ID','Tanggal','Pelanggan','Produk','Jumlah','Harga Satuan','Total','Metode'],...db.penjualan.map(x=>[idLabel(type,x.id),x.tanggal,byId('pelanggan',x.pelangganId)?.nama||'',byId('produk',x.produkId)?.nama||'',x.qty,x.harga,totalSale(x),x.metode])];
 if(type==='pengeluaran')rows=[['ID','Tanggal','Keterangan','Kategori','Nominal','Metode'],...db.pengeluaran.map(x=>[idLabel(type,x.id),x.tanggal,x.keterangan,x.kategori,x.nominal,x.metode])];
 if(type==='laporan')rows=[['Jenis','Keterangan','Nilai'],['Penjualan','Total penjualan',db.penjualan.reduce((s,x)=>s+totalSale(x),0)],['Pengeluaran','Total pengeluaran',db.pengeluaran.reduce((s,x)=>s+Number(x.nominal),0)],['Laba estimasi','Penjualan - pengeluaran',db.penjualan.reduce((s,x)=>s+totalSale(x),0)-db.pengeluaran.reduce((s,x)=>s+Number(x.nominal),0)],...db.produk.map(p=>['Produk terjual',p.nama,db.penjualan.filter(s=>s.produkId===p.id).reduce((s,x)=>s+x.qty,0)])];
 const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');downloadBlob('\ufeff'+csv,`cookiehouse_${filename}_${dateNow}.csv`,'text/csv;charset=utf-8');toast('File CSV berhasil dibuat.');
}
function exportBackup(){const data={app:'CookieHouse',version:3,exportedAt:new Date().toISOString(),data:db};downloadBlob(JSON.stringify(data,null,2),`cookiehouse_backup_${dateNow}.json`,'application/json');toast('Backup JSON berhasil diunduh.')}
function downloadBlob(content,name,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}
function importBackup(){const file=document.getElementById('importFile').files[0];if(!file){toast('Pilih file backup JSON terlebih dahulu.');return}const reader=new FileReader();reader.onload=async()=>{let d;try{const raw=JSON.parse(reader.result);d=raw.data||raw;if(!['produk','pelanggan','penjualan','pengeluaran'].every(k=>Array.isArray(d[k])))throw Error('format')}catch(e){toast('File backup tidak valid atau formatnya tidak cocok.');return}if(!confirm('Import akan mengganti seluruh data di database. Lanjutkan?'))return;await run(()=>api.restoreAll(d),'Backup berhasil dipulihkan.')};reader.readAsText(file)}
async function resetData(){if(!confirm('Yakin menghapus SELURUH data CookieHouse dari database? Sebaiknya download backup terlebih dahulu.'))return;await run(()=>api.clearAll(),'Semua data berhasil dihapus.')}
document.getElementById('today').textContent='📅 '+new Date().toLocaleDateString('id-ID',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
init();
