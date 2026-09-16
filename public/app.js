const icons = ["⚡","🔌","💡","🧰","🔋"];

async function loadProducts(){
  const res = await fetch("/api/products");
  const products = await res.json();
  document.querySelector("#productGrid").innerHTML = products.map((p,i)=>`
    <article class="product">
      <div class="icon">${icons[i] || "⚙️"}</div>
      <h3>${p.name}</h3>
      <p>${p.description}</p>
      <button onclick="selectProduct('${p.name.replaceAll("'","&#39;")}')">Ajouter à ma demande →</button>
    </article>`).join("");
}
function selectProduct(name){
  const field = document.querySelector('[name="itemsText"]');
  field.value = field.value ? field.value + ", " + name : name;
  document.querySelector("#commander").scrollIntoView({behavior:"smooth"});
}
document.querySelector("#orderForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  const data = Object.fromEntries(f.entries());
  data.items = data.itemsText.split(",").map(x=>x.trim()).filter(Boolean);
  delete data.itemsText;
  const out = document.querySelector("#orderResult");
  out.textContent = "Envoi en cours…";
  const res = await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
  const json = await res.json();
  if(res.ok){
    out.textContent = `✓ Demande enregistrée. Référence #${json.orderId}. Notre équipe pourra vous recontacter.`;
    e.currentTarget.reset();
  } else out.textContent = "Erreur: " + (json.error || "Impossible d'envoyer la demande.");
});

function openChat(){document.querySelector("#chat").classList.add("open");document.querySelector("#chatInput").focus()}
function closeChat(){document.querySelector("#chat").classList.remove("open")}
document.querySelector("#chatForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const input=document.querySelector("#chatInput"), box=document.querySelector("#chatMessages");
  const message=input.value.trim(); if(!message)return;
  box.insertAdjacentHTML("beforeend",`<div class="bubble user">${escapeHtml(message)}</div>`);
  input.value="";
  box.insertAdjacentHTML("beforeend",`<div class="bubble bot" id="typing">…</div>`);
  box.scrollTop=box.scrollHeight;
  try{
    const res=await fetch("/api/support",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message})});
    const json=await res.json();
    document.querySelector("#typing")?.remove();
    box.insertAdjacentHTML("beforeend",`<div class="bubble bot">${escapeHtml(json.answer || json.error || "Service indisponible.")}</div>`);
  }catch(err){
    document.querySelector("#typing")?.remove();
    box.insertAdjacentHTML("beforeend",`<div class="bubble bot">Service indisponible. Contactez-nous au +237 690 380 214.</div>`);
  }
  box.scrollTop=box.scrollHeight;
});
function escapeHtml(s){return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
loadProducts();
