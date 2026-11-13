var $ = function (id) { return document.getElementById(id); };

// ---------- Menú ----------
function ir(nombre) {
  document.querySelectorAll(".sec").forEach(function (s) { s.hidden = s.id !== nombre; });
  document.querySelectorAll("#menu button").forEach(function (b) {
    b.classList.toggle("activo", b.dataset.sec === nombre);
  });
  if (nombre === "pinyin") mostrarPinyin();
  if (nombre === "buscar") mostrarBusqueda();
  if (nombre === "traducir") prepararTraduccion();
}
document.querySelectorAll("#menu button").forEach(function (b) {
  b.addEventListener("click", function () { ir(b.dataset.sec); });
});

// ---------- Leer imagen (OCR con Tesseract, verso a verso) ----------
var imgActual = null, sel = null, arrastrando = false, analisis = null, geoRecorte = null, elegida = null;
var RE_ZH = /[\u3400-\u9fff\uf900-\ufaff，。！？、；：《》“”‘’（）]/;
var NO_ZH = /[^\u3400-\u9fff\uf900-\ufaff，。！？、；：《》“”‘’（）]/g;
var lienzo = $("lienzo"), ctx = lienzo.getContext("2d");

// Dibuja la foto y, encima, el rectángulo rojo de la zona elegida
function dibujar() {
  if (!imgActual) return;
  ctx.drawImage(imgActual, 0, 0, lienzo.width, lienzo.height);
  if (analisis) pintarCapas();
  if (sel) {
    ctx.strokeStyle = "#d33";
    ctx.lineWidth = Math.max(2, lienzo.width / 300);
    ctx.strokeRect(sel.x0, sel.y0, sel.x1 - sel.x0, sel.y1 - sel.y0);
  }
}
function punto(e) {
  var r = lienzo.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(lienzo.width, (e.clientX - r.left) * lienzo.width / r.width)),
    y: Math.max(0, Math.min(lienzo.height, (e.clientY - r.top) * lienzo.height / r.height))
  };
}
lienzo.addEventListener("pointerdown", function (e) {
  if (!imgActual) return;
  var p = punto(e);
  sel = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  analisis = null; $("analisis").hidden = true;
  arrastrando = true;
  lienzo.setPointerCapture(e.pointerId);
});
lienzo.addEventListener("pointermove", function (e) {
  if (!arrastrando) return;
  var p = punto(e);
  sel.x1 = p.x; sel.y1 = p.y;
  dibujar();
});
lienzo.addEventListener("pointerup", function () {
  arrastrando = false;
  if (sel && (Math.abs(sel.x1 - sel.x0) < 20 || Math.abs(sel.y1 - sel.y0) < 20)) { sel = null; dibujar(); }
});

// 1. Recorta la zona elegida (sin agrandar)
function recorteCanvas() {
  var x = 0, y = 0, w = imgActual.width, h = imgActual.height;
  if (sel) {
    x = Math.min(sel.x0, sel.x1); y = Math.min(sel.y0, sel.y1);
    w = Math.abs(sel.x1 - sel.x0); h = Math.abs(sel.y1 - sel.y0);
  }
  var f = Math.min(1, 1600 / Math.max(w, h));
  var c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * f));
  c.height = Math.max(1, Math.round(h * f));
  c.getContext("2d").drawImage(imgActual, x, y, w, h, 0, 0, c.width, c.height);
  geoRecorte = { x: x, y: y, f: f };
  return c;
}

// 2. Blanco y negro: se quita el color del fondo y los dibujos claros
function umbralOtsu(gris) {
  var hist = new Array(256).fill(0), total = gris.length, suma = 0, i;
  for (i = 0; i < total; i++) { hist[gris[i]]++; suma += gris[i]; }
  var sb = 0, wb = 0, mejor = 0, umbral = 128;
  for (var t = 0; t < 256; t++) {
    wb += hist[t];
    if (!wb) continue;
    var wf = total - wb;
    if (!wf) break;
    sb += t * hist[t];
    var mb = sb / wb, mf = (suma - sb) / wf, v = wb * wf * (mb - mf) * (mb - mf);
    if (v > mejor) { mejor = v; umbral = t; }
  }
  return umbral;
}

function binarizar(c) {
  var d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  var n = c.width * c.height, gris = new Uint8Array(n), i;
  for (i = 0; i < n; i++) gris[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  var u = umbralOtsu(gris), bin = new Uint8Array(n), oscuros = 0;
  for (i = 0; i < n; i++) { if (gris[i] <= u) { bin[i] = 1; oscuros++; } }
  if (oscuros > n / 2) for (i = 0; i < n; i++) bin[i] = 1 - bin[i]; // texto claro sobre fondo oscuro
  return { bin: bin, w: c.width, h: c.height };
}

// 3. Busca las franjas de texto: cada verso (o columna) es una franja
function perfil(b, vertical) {
  var p = new Array(vertical ? b.w : b.h).fill(0), x, y;
  for (y = 0; y < b.h; y++) {
    for (x = 0; x < b.w; x++) { if (b.bin[y * b.w + x]) p[vertical ? x : y]++; }
  }
  return p;
}

function encontrarBandas(p) {
  var max = Math.max.apply(null, p), um = Math.max(2, 0.08 * max), res = [], ini = -1;
  for (var i = 0; i < p.length; i++) {
    if (p[i] > um && ini < 0) ini = i;
    if (p[i] <= um && ini >= 0) { res.push({ ini: ini, fin: i - 1 }); ini = -1; }
  }
  if (ini >= 0) res.push({ ini: ini, fin: p.length - 1 });
  return res.filter(function (b) { return b.fin - b.ini + 1 >= 6; });
}

// 4. Se quedan solo las franjas grandes: el pinyin y las notas son más finos y se descartan
function bandasDeTexto(bandas) {
  if (!bandas.length) return [];
  var alt = bandas.map(function (b) { return b.fin - b.ini + 1; }).sort(function (a, b) { return a - b; });
  var ref = alt[Math.min(alt.length - 1, Math.floor(alt.length * 0.75))];
  return bandas.filter(function (b) { return b.fin - b.ini + 1 >= ref * 0.6; });
}

// 5. Recorta cada franja, la agranda y le pone margen blanco para leerla sola
function canvasBanda(b, banda, vertical) {
  var lo = Infinity, hi = -1, x, y;
  if (!vertical) {
    for (y = banda.ini; y <= banda.fin; y++) for (x = 0; x < b.w; x++) if (b.bin[y * b.w + x]) { if (x < lo) lo = x; if (x > hi) hi = x; }
  } else {
    for (x = banda.ini; x <= banda.fin; x++) for (y = 0; y < b.h; y++) if (b.bin[y * b.w + x]) { if (y < lo) lo = y; if (y > hi) hi = y; }
  }
  if (hi < 0) return null;

  var grosor = banda.fin - banda.ini + 1, pad = Math.round(grosor * 0.3);
  var f = Math.max(1, Math.min(4, 90 / grosor));
  var ox = vertical ? banda.ini : lo, oy = vertical ? lo : banda.ini;
  var ancho = vertical ? grosor : hi - lo + 1, alto = vertical ? hi - lo + 1 : grosor;

  var tmp = document.createElement("canvas");
  tmp.width = ancho; tmp.height = alto;
  var tc = tmp.getContext("2d"), im = tc.createImageData(ancho, alto), j, k;
  for (y = 0; y < alto; y++) {
    for (x = 0; x < ancho; x++) {
      j = (y * ancho + x) * 4;
      k = b.bin[(oy + y) * b.w + (ox + x)] ? 0 : 255;
      im.data[j] = im.data[j + 1] = im.data[j + 2] = k;
      im.data[j + 3] = 255;
    }
  }
  tc.putImageData(im, 0, 0);

  var c = document.createElement("canvas");
  c.width = Math.round((ancho + 2 * pad) * f);
  c.height = Math.round((alto + 2 * pad) * f);
  var cx = c.getContext("2d");
  cx.fillStyle = "#fff";
  cx.fillRect(0, 0, c.width, c.height);
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = "high";
  cx.drawImage(tmp, pad * f, pad * f, ancho * f, alto * f);
  c.geo = { f: f, pad: pad, ox: ox, oy: oy };
  return c;
}

// ---------- Análisis: líneas y letras detectadas ----------
function aOriginal(c, px, py) {
  var g = c.geo, r = geoRecorte;
  return { x: r.x + (px / g.f - g.pad + g.ox) / r.f, y: r.y + (py / g.f - g.pad + g.oy) / r.f };
}

// Tesseract.js v5 da las letras dentro de blocks > paragraphs > lines > words > symbols
function simbolos(d) {
  if (d.symbols && d.symbols.length) return d.symbols;
  var res = [];
  (d.blocks || []).forEach(function (b) { b.paragraphs.forEach(function (p) { p.lines.forEach(function (l) {
    l.words.forEach(function (w) { (w.symbols || []).forEach(function (s) { res.push(s); }); });
  }); }); });
  return res;
}

function claseConf(c) { return c >= 85 ? "alta" : c >= 60 ? "media" : "baja"; }
var COLOR = { alta: "#2f8f5b", media: "#d89a1d", baja: "#c23b2e" };

function pintarCapas() {
  var lw = Math.max(1.5, lienzo.width / 500);
  analisis.forEach(function (l, i) {
    if ($("verLineas").checked) {
      ctx.strokeStyle = "#2b6cb0"; ctx.lineWidth = lw * 1.4;
      ctx.strokeRect(l.x0, l.y0, l.x1 - l.x0, l.y1 - l.y0);
    }
    if ($("verLetras").checked) l.letras.forEach(function (t, j) {
      var es = elegida && elegida.l === i && elegida.i === j;
      ctx.strokeStyle = COLOR[claseConf(t.conf)]; ctx.lineWidth = lw;
      if (es) { ctx.fillStyle = "rgba(216,154,29,.35)"; ctx.fillRect(t.x0, t.y0, t.x1 - t.x0, t.y1 - t.y0); }
      ctx.strokeRect(t.x0, t.y0, t.x1 - t.x0, t.y1 - t.y0);
    });
  });
}

function pintarAnalisis() {
  var cont = $("listaLineas");
  cont.innerHTML = ""; elegida = null;
  analisis.forEach(function (l, i) {
    var f = document.createElement("div"); f.className = "linea";
    var n = document.createElement("span"); n.className = "num";
    n.textContent = ($("orientacion").value === "vertical" ? "Columna " : "Línea ") + (i + 1) + " · " + l.conf + "%";
    var ls = document.createElement("div"); ls.className = "letras";
    l.letras.forEach(function (t, j) {
      var b = document.createElement("button"); b.type = "button";
      b.className = "letra " + claseConf(t.conf); b.textContent = t.t;
      b.title = t.conf + "%";
      b.addEventListener("click", function () {
        elegida = { l: i, i: j };
        document.querySelectorAll(".letra").forEach(function (x) { x.classList.remove("elegida"); });
        b.classList.add("elegida");
        $("detalle").textContent = "«" + t.t + "» · confianza " + t.conf + "%" + (t.alt.length ? " · alternativas: " + t.alt.join(" ") : "");
        dibujar();
      });
      ls.appendChild(b);
    });
    f.appendChild(n); f.appendChild(ls); cont.appendChild(f);
  });
  $("analisis").hidden = false;
}
$("verLineas").addEventListener("change", dibujar);
$("verLetras").addEventListener("change", dibujar);
$("usar").addEventListener("click", function () { ir("poema"); });

$("archivo").addEventListener("change", function (e) {
  var f = e.target.files[0];
  if (!f) return;
  var img = new Image();
  img.onload = function () {
    imgActual = img; sel = null; analisis = null; $("analisis").hidden = true;
    lienzo.width = img.width; lienzo.height = img.height;
    lienzo.style.display = "block";
    dibujar();
    $("estado").textContent = "Arrastra sobre la foto para marcar desde el título hasta el último verso (sin dibujos) y pulsa Leer.";
  };
  img.src = URL.createObjectURL(f);
});

$("leer").addEventListener("click", async function () {
  var estado = $("estado"), boton = $("leer");
  if (!imgActual) { estado.textContent = "Sube una imagen primero."; return; }
  var vertical = $("orientacion").value === "vertical";
  boton.disabled = true;
  estado.textContent = "Preparando la imagen...";
  var w = null;
  try {
    var b = binarizar(recorteCanvas());
    var bandas = bandasDeTexto(encontrarBandas(perfil(b, vertical)));
    if (vertical) bandas.reverse(); // las columnas se leen de derecha a izquierda
    if (!bandas.length) {
      estado.textContent = "No se detectó texto. Marca mejor la zona o prueba la otra orientación.";
      return;
    }

    estado.textContent = "Cargando el idioma... la primera vez tarda.";
    w = await Tesseract.createWorker(vertical ? "chi_sim_vert" : "chi_sim", 1, {});
    await w.setParameters({ tessedit_pageseg_mode: vertical ? "5" : "7" });

    var res = [];
    for (var i = 0; i < bandas.length; i++) {
      estado.textContent = "Leyendo " + (vertical ? "columna " : "verso ") + (i + 1) + " de " + bandas.length + "...";
      var c = canvasBanda(b, bandas[i], vertical);
      if (!c) continue;
      var r = await w.recognize(c, {}, { blocks: true });
      var letras = simbolos(r.data).filter(function (s) { return RE_ZH.test(s.text); }).map(function (s) {
        var p = aOriginal(c, s.bbox.x0, s.bbox.y0), q = aOriginal(c, s.bbox.x1, s.bbox.y1);
        return { t: s.text, conf: Math.round(s.confidence), x0: p.x, y0: p.y, x1: q.x, y1: q.y,
          alt: (s.choices || []).map(function (o) { return o.text; }).filter(function (t) { return t !== s.text; }).slice(0, 4) };
      });
      var texto = letras.length ? letras.map(function (t) { return t.t; }).join("") : r.data.text.replace(NO_ZH, "");
      if (!texto) continue;
      var g = c.geo, p0 = aOriginal(c, g.pad * g.f, g.pad * g.f), p1 = aOriginal(c, c.width - g.pad * g.f, c.height - g.pad * g.f);
      var media = letras.length ? Math.round(letras.reduce(function (s, t) { return s + t.conf; }, 0) / letras.length) : 0;
      res.push({ texto: texto, conf: media, x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y, letras: letras });
    }

    if (!res.length) {
      estado.textContent = "No se detectó texto. Prueba otra foto u otra orientación.";
    } else {
      $("texto").value = res.map(function (l) { return l.texto; }).join("\n");
      analisis = res;
      pintarAnalisis();
      dibujar();
      estado.textContent = res.length + (vertical ? " columnas" : " líneas") + " y " +
        res.reduce(function (s, l) { return s + l.letras.length; }, 0) + " letras detectadas.";
    }
  } catch (err) {
    estado.textContent = "No se pudo leer. Abre la web con Live Server, no con doble clic.";
    console.error(err);
  } finally {
    if (w) await w.terminate();
    boton.disabled = false;
  }
});

// ---------- Poema ----------
$("invertir").addEventListener("click", function () {
  $("texto").value = $("texto").value.split("\n").reverse().join("\n");
});
$("borrar").addEventListener("click", function () { $("texto").value = ""; });

// ---------- Pinyin ----------
function mostrarPinyin() {
  var cont = $("salidaPinyin");
  var versos = $("texto").value.split("\n").filter(function (l) { return l.trim(); });
  cont.innerHTML = "";
  if (!versos.length) { cont.textContent = "Aún no hay poema."; return; }
  if (typeof pinyinPro === "undefined") { cont.textContent = "No se pudo cargar el pinyin."; return; }

  versos.forEach(function (v) {
    v = v.trim();
    var py = pinyinPro.pinyin(v, { type: "array" });
    var linea = document.createElement("div");
    Array.from(v).forEach(function (c, i) {
      var ruby = document.createElement("ruby");
      ruby.appendChild(document.createTextNode(c));
      var rt = document.createElement("rt");
      rt.textContent = /[\u3400-\u9fff\uf900-\ufaff]/.test(c) && py[i] ? py[i] : "";
      ruby.appendChild(rt);
      linea.appendChild(ruby);
    });
    cont.appendChild(linea);
  });
}

// ---------- Escuchar (con pausas) ----------
var PAUSA_SIGNO = 500;   // milisegundos tras cada coma, punto, etc.
var PAUSA_LINEA = 500;   // milisegundos al cambiar de verso o de párrafo
var idHabla = 0;

// Parte el texto en trozos y apunta cuánto parar después de cada uno
function trozos(texto) {
  var piezas = texto.match(/[^，。！？、；：,.;:!?\n]+|[，。！？、；：,.;:!?]|\n+/g) || [];
  var lista = [];
  piezas.forEach(function (p) {
    var ultimo = lista[lista.length - 1];
    if (/^\n+$/.test(p)) {
      if (ultimo) ultimo.pausa = Math.max(ultimo.pausa, PAUSA_LINEA);
    } else if (/^[，。！？、；：,.;:!?]$/.test(p)) {
      if (ultimo) ultimo.pausa = Math.max(ultimo.pausa, PAUSA_SIGNO);
    } else if (p.trim()) {
      lista.push({ texto: p.trim(), pausa: 0 });
    }
  });
  return lista;
}

$("hablar").addEventListener("click", function () {
  var t = $("texto").value.trim();
  if (!t) { $("aviso").textContent = "Aún no hay poema."; return; }
  $("aviso").textContent = "";

  var lista = trozos(t), i = 0, mio = ++idHabla;
  speechSynthesis.cancel();

  function siguiente() {
    if (mio !== idHabla || i >= lista.length) return;
    var trozo = lista[i++];
    var u = new SpeechSynthesisUtterance(trozo.texto);
    u.lang = "zh-CN";
    var seguir = function () { setTimeout(siguiente, trozo.pausa); };
    u.onend = seguir;
    u.onerror = seguir;
    speechSynthesis.speak(u);
  }
  siguiente();
});

$("parar").addEventListener("click", function () {
  idHabla++;
  speechSynthesis.cancel();
});

// ---------- Poemas de los lados ----------
function cargarLado(p) {
  $("texto").value = p.dataset.poema;
  $("titulo").value = p.querySelector("h3").textContent;
  ir("poema");
}
document.querySelectorAll(".lado").forEach(function (p) {
  p.addEventListener("click", function () { cargarLado(p); });
});

function guardarLados() {
  var lista = [];
  document.querySelectorAll(".lado.propio").forEach(function (p) {
    lista.push({ t: p.querySelector("h3").textContent, v: p.dataset.poema });
  });
  try { localStorage.setItem("poemasLados", JSON.stringify(lista)); } catch (e) {}
}

function crearLado(titulo, texto) {
  var versos = texto.split("\n");
  var a = document.createElement("article");
  a.className = "lado propio";
  a.dataset.poema = texto;
  a.title = "Clic para cargarlo";

  var h = document.createElement("h3");
  h.textContent = titulo;
  var cont = document.createElement("div");
  cont.className = "versos";
  versos.forEach(function (v) {
    var d = document.createElement("div");
    d.textContent = v;
    cont.appendChild(d);
  });
  var x = document.createElement("button");
  x.className = "quitar";
  x.type = "button";
  x.textContent = "×";
  x.title = "Quitar de los lados";
  x.addEventListener("click", function (e) {
    e.stopPropagation();
    a.remove();
    guardarLados();
  });
  a.appendChild(x); a.appendChild(h); a.appendChild(cont);
  a.addEventListener("click", function () { cargarLado(a); });

  // Se coloca en el lado que tenga menos poemas
  var izq = document.querySelector(".izq"), der = document.querySelector(".der");
  (izq.children.length <= der.children.length ? izq : der).appendChild(a);
}

function anadirALados(titulo, texto) {
  var repetido = Array.prototype.some.call(document.querySelectorAll(".lado"), function (p) {
    return p.dataset.poema === texto;
  });
  if (repetido) return "Ese poema ya está en los lados.";
  crearLado(titulo, texto);
  guardarLados();
  return "Añadido a los lados.";
}

$("fijar").addEventListener("click", function () {
  var texto = $("texto").value.split("\n")
    .map(function (l) { return l.trim(); })
    .filter(function (l) { return l; })
    .join("\n");
  $("msgLado").textContent = texto
    ? anadirALados($("titulo").value.trim() || "Sin título", texto)
    : "Escribe un poema primero.";
});

// Recupera los poemas añadidos en visitas anteriores
try {
  JSON.parse(localStorage.getItem("poemasLados") || "[]").forEach(function (p) { crearLado(p.t, p.v); });
} catch (e) {}

// ---------- Buscar poemas ----------
function norm(t) {
  return String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Busca en la biblioteca (poemas.js) y en los poemas de tu cuenta
async function buscarPoemas(q) {
  q = norm(q.trim());
  var f = $("fuente").value, lista = [];
  if (f !== "biblioteca") lista = await poemasNube();
  if (f !== "mios") lista = lista.concat(POEMAS.map(function (p) { return Object.assign({ origen: "biblioteca" }, p); }));
  if (!q) return lista;
  return lista.filter(function (p) {
    var v = (p.versos || []).join(""), py = "";
    if (typeof pinyinPro !== "undefined") py = pinyinPro.pinyin(v, { toneType: "none" }) + " " + pinyinPro.pinyin(v, { toneType: "none", type: "array" }).join("");
    return norm([p.titulo, p.titulo_es, p.autor, p.autor_pinyin, p.dinastia, v, py, (p.traduccion || []).join(" "), p.nota].join(" ")).indexOf(q) >= 0;
  });
}

// ---------- Cuenta y base de datos (Supabase) ----------
var nube = { sb: null, user: null, cache: null };
function iniciarNube() {
  if (typeof supabase === "undefined") { // sin conexión: la web sigue funcionando sin cuenta
    $("cuenta").hidden = true;
    document.querySelector("#fuente option[value=mios]").disabled = true;
    return;
  }
  nube.sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  nube.sb.auth.onAuthStateChange(function (_e, ses) { aplicarSesion(ses ? ses.user : null); });
}
function aplicarSesion(user) {
  nube.user = user; nube.cache = null;
  $("entrar").textContent = user ? "Mi cuenta" : "Entrar";
  $("salir").hidden = !user;
  $("usuario").textContent = user ? user.email : "";
  setTimeout(function () {
    if (!$("vistaCuenta").hidden) actualizarCuenta();
    if (!$("buscar").hidden) mostrarBusqueda();
  }, 0);
}
// Cierra la sesión en este navegador (sin depender de la red) y vuelve a la web
async function salir() {
  var r = await nube.sb.auth.signOut({ scope: "local" });
  if (r.error) console.error(r.error);
  aplicarSesion(null);
  verCuenta(false);
}
// Pantalla de cuenta: formulario si no hay sesión, resumen si la hay
function verCuenta(si) {
  document.body.classList.toggle("en-cuenta", si);
  $("vistaCuenta").hidden = !si;
  if (!si) return;
  window.scrollTo(0, 0);
  actualizarCuenta();
  (nube.user ? $("verMios") : $("correo")).focus();
}
async function actualizarCuenta() {
  var dentro = !!nube.user;
  $("cuentaForm").hidden = dentro; $("cuentaSesion").hidden = !dentro;
  if (!dentro) return;
  $("correoSesion").textContent = nube.user.email;
  $("numPoemas").textContent = "Cargando tus poemas...";
  var n = (await poemasNube()).length;
  $("numPoemas").textContent = n === 1 ? "Tienes 1 poema guardado." : "Tienes " + n + " poemas guardados.";
}
async function poemasNube() {
  if (!nube.user) return [];
  if (nube.cache) return nube.cache;
  var r = await nube.sb.from("poemas").select("*").order("creado", { ascending: false });
  if (r.error) { console.error(r.error); return []; }
  nube.cache = r.data.map(function (d) { return Object.assign({ origen: "mio" }, d); });
  return nube.cache;
}
async function nubeBorrar(id) {
  var r = await nube.sb.from("poemas").delete().eq("id", id);
  if (r.error) console.error(r.error);
  nube.cache = null;
}
var modoCrear = false;
function ponerModo(crear) {
  modoCrear = crear;
  $("tabEntrar").classList.toggle("activa", !crear);
  $("tabCrear").classList.toggle("activa", crear);
  $("tituloCuenta").textContent = crear ? "Crea tu cuenta" : "Bienvenido de nuevo";
  $("subCuenta").textContent = crear ? "Guarda tus poemas y encuéntralos desde cualquier dispositivo." : "Entra para guardar y buscar tus poemas.";
  $("btnLogin").textContent = crear ? "Crear cuenta" : "Entrar";
  $("clave").autocomplete = crear ? "new-password" : "current-password";
  $("errCuenta").textContent = ""; $("errCuenta").className = "aviso";
}
$("entrar").addEventListener("click", function () { ponerModo(false); verCuenta(true); });
$("volver").addEventListener("click", function () { verCuenta(false); });
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("vistaCuenta").hidden) verCuenta(false); });
$("verMios").addEventListener("click", function () { verCuenta(false); $("fuente").value = "mios"; ir("buscar"); });
$("tabEntrar").addEventListener("click", function () { ponerModo(false); });
$("tabCrear").addEventListener("click", function () { ponerModo(true); });
$("verClave").addEventListener("click", function () {
  var oculta = $("clave").type === "password";
  $("clave").type = oculta ? "text" : "password";
  $("verClave").textContent = oculta ? "Ocultar" : "Ver";
});
$("salir").addEventListener("click", salir);
$("salirPanel").addEventListener("click", salir);
var MENSAJES = {
  "Invalid login credentials": "Correo o contraseña incorrectos.",
  "User already registered": "Ya existe una cuenta con ese correo. Prueba a entrar.",
  "Email not confirmed": "Aún no has confirmado el correo. Revisa tu bandeja de entrada."
};
$("formCuenta").addEventListener("submit", async function (e) {
  e.preventDefault();
  var err = $("errCuenta"), btn = $("btnLogin"), datos = { email: $("correo").value.trim(), password: $("clave").value };
  err.className = "aviso";
  if (!datos.email || datos.password.length < 6) { err.textContent = "Escribe tu correo y una contraseña de al menos 6 caracteres."; return; }
  btn.disabled = true; err.textContent = "Un momento...";
  var r = modoCrear ? await nube.sb.auth.signUp(datos) : await nube.sb.auth.signInWithPassword(datos);
  btn.disabled = false;
  if (r.error) { err.textContent = MENSAJES[r.error.message] || r.error.message; return; }
  if (modoCrear && !r.data.session) { err.className = "aviso ok"; err.textContent = "Cuenta creada. Revisa tu correo para confirmarla y entra después."; return; }
  $("clave").value = "";
});
$("fuente").addEventListener("change", mostrarBusqueda);
$("nube").addEventListener("click", async function () {
  var versos = $("texto").value.split("\n").map(function (l) { return l.trim(); }).filter(Boolean), msg = $("msgLado");
  if (!versos.length) { msg.textContent = "Escribe un poema primero."; return; }
  if (!nube.user) { msg.textContent = "Entra con tu cuenta para guardar en la nube."; ponerModo(false); verCuenta(true); return; }
  var r = await nube.sb.from("poemas").insert({ titulo: $("titulo").value.trim() || "Sin título", versos: versos });
  if (r.error) { console.error(r.error); msg.textContent = "No se pudo guardar: " + r.error.message; return; }
  nube.cache = null;
  msg.textContent = "Guardado en tu cuenta.";
});
iniciarNube();

async function mostrarBusqueda() {
  var cont = $("resultados");
  var res = await buscarPoemas($("consulta").value);
  cont.innerHTML = "";
  if (!res.length) {
    cont.textContent = $("fuente").value === "mios" && !nube.user ? "Entra con tu cuenta para buscar en tus poemas." : "No se encontró ningún poema.";
    return;
  }

  res.forEach(function (p) {
    var d = document.createElement("div");
    d.className = "resultado";

    var h = document.createElement("h3");
    h.textContent = p.titulo;
    if (p.origen === "mio") { var et = document.createElement("span"); et.className = "etiqueta"; et.textContent = "Mío"; h.prepend(et); }
    var es = document.createElement("div");
    es.className = "es";
    es.textContent = [p.titulo_es, [p.autor, p.autor_pinyin].filter(Boolean).join(" "), p.dinastia && "(" + p.dinastia + ")"].filter(Boolean).join(" · ");
    var pr = document.createElement("div");
    pr.className = "primero";
    pr.textContent = p.versos[0] + " …" + (p.traduccion && p.traduccion[0] ? " · " + p.traduccion[0] : "");

    var abrir = document.createElement("button");
    abrir.type = "button";
    abrir.textContent = "Abrir";
    abrir.addEventListener("click", function () {
      $("texto").value = p.versos.join("\n");
      $("titulo").value = p.titulo;
      ir("poema");
    });

    var trad = document.createElement("button");
    trad.type = "button";
    trad.textContent = "🌐 Traducir";
    trad.addEventListener("click", function () {
      $("texto").value = p.versos.join("\n");
      $("titulo").value = p.titulo;
      ir("traducir");
    });

    var lados = document.createElement("button");
    lados.type = "button";
    lados.className = "suave";
    lados.textContent = "📌 A los lados";
    lados.addEventListener("click", function () {
      lados.textContent = anadirALados(p.titulo, p.versos.join("\n")) === "Añadido a los lados." ? "✓ Añadido" : "Ya está";
    });

    d.appendChild(h); d.appendChild(es); d.appendChild(pr);
    d.appendChild(abrir); d.appendChild(trad); d.appendChild(lados);
    if (p.origen === "mio") {
      var del = document.createElement("button");
      del.type = "button"; del.className = "suave"; del.textContent = "Borrar";
      del.addEventListener("click", async function () {
        if (!confirm("¿Borrar «" + p.titulo + "» de tu cuenta?")) return;
        await nubeBorrar(p.id);
        mostrarBusqueda();
      });
      d.appendChild(del);
    }
    cont.appendChild(d);
  });
}
$("consulta").addEventListener("input", mostrarBusqueda);

// ---------- Traducir al español (solo los poemas de la base de datos) ----------
function limpiar(t) { return t.replace(/[\s，。！？、；：《》“”‘’（）,.!?]/g, ""); }

function encontrarPoema(texto) {
  var t = limpiar(texto);
  if (!t) return -1;
  for (var i = 0; i < POEMAS.length; i++) {
    if (limpiar(POEMAS[i].versos.join("")) === t) return i;
  }
  return -1;
}

function prepararTraduccion() {
  var sel = $("elegirPoema"), aviso = $("avisoTrad");
  if (!sel.options.length) {
    POEMAS.forEach(function (p, i) {
      var o = document.createElement("option");
      o.value = i;
      o.textContent = p.titulo + " · " + p.titulo_es;
      sel.appendChild(o);
    });
  }
  var texto = $("texto").value;
  var i = encontrarPoema(texto);
  if (i >= 0) {
    sel.value = i;
    aviso.textContent = "";
  } else if (texto.trim()) {
    aviso.textContent = "Ese poema aún no está traducido. Por ahora solo hay " + POEMAS.length + ": elige uno de la lista.";
  } else {
    aviso.textContent = "";
  }
  mostrarTraduccion();
}

function mostrarTraduccion() {
  var p = POEMAS[$("elegirPoema").value];
  var cont = $("traduccion");
  cont.innerHTML = "";
  if (!p) return;

  var h = document.createElement("h3");
  h.textContent = p.titulo;
  var sub = document.createElement("div");
  sub.className = "es";
  sub.textContent = p.titulo_es + " · " + p.autor + " " + p.autor_pinyin + " (" + p.dinastia + ")";
  cont.appendChild(h);
  cont.appendChild(sub);

  p.versos.forEach(function (v, i) {
    var f = document.createElement("div");
    f.className = "fila";
    var zh = document.createElement("div");
    zh.className = "zh";
    zh.textContent = v;
    f.appendChild(zh);
    if (typeof pinyinPro !== "undefined") {
      var py = document.createElement("div");
      py.className = "py";
      py.textContent = pinyinPro.pinyin(v);
      f.appendChild(py);
    }
    var es = document.createElement("div");
    es.className = "esp";
    es.textContent = p.traduccion[i];
    f.appendChild(es);
    cont.appendChild(f);
  });

  var n = document.createElement("div");
  n.className = "nota";
  n.textContent = p.nota;
  cont.appendChild(n);
}
$("elegirPoema").addEventListener("change", mostrarTraduccion);
