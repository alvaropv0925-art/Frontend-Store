// Servidor sin dependencias: solo necesitas Node.js (https://nodejs.org)
// Uso:  node server.js   ->   abre http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');

const PUERTO = process.env.PORT || 3000;
const RAIZ = __dirname;
const ARCHIVO_CSV = path.join(RAIZ, 'BasedeDatos.csv');
const SEPARADOR = ';';   // Excel en español usa ";". Cámbialo a "," si lo prefieres.
const TALLAS = ['Chica', 'Mediana', 'Grande'];
const COLUMNAS = ['id_pedido', 'fecha', 'id_producto', 'producto', 'talla', 'cantidad',
                  'precio_unitario', 'total', 'nombre', 'correo', 'telefono', 'direccion'];

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png'
};

const leerProductos = () => JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'productos.json'), 'utf8'));

// Convierte un valor en una celda CSV segura
function celda(valor) {
  let t = String(valor).replace(/[\r\n]+/g, ' ').trim();
  if (/^[=+\-@\t]/.test(t)) t = "'" + t;          // evita fórmulas maliciosas en Excel
  if (t.includes(SEPARADOR) || t.includes('"')) t = '"' + t.replace(/"/g, '""') + '"';
  return t;
}

function guardarPedido(p) {
  const existe = fs.existsSync(ARCHIVO_CSV) && fs.statSync(ARCHIVO_CSV).size > 0;
  let id = 1;
  let salida = '';
  if (!existe) {
    salida += '\uFEFF' + COLUMNAS.join(SEPARADOR) + '\r\n';   // BOM para que Excel lea las tildes
  } else {
    id = fs.readFileSync(ARCHIVO_CSV, 'utf8').split(/\r?\n/).filter(Boolean).length; // filas de datos + 1
  }
  const fila = [id, p.fecha, p.id_producto, p.producto, p.talla, p.cantidad,
                p.precio_unitario, p.total, p.nombre, p.correo, p.telefono, p.direccion];
  salida += fila.map(celda).join(SEPARADOR) + '\r\n';
  fs.appendFileSync(ARCHIVO_CSV, salida, 'utf8');
  return id;
}

function validar(d) {
  const productos = leerProductos();
  const producto = productos.find(x => x.id === Number(d.id_producto));
  if (!producto) return { error: 'Producto no válido.' };
  if (!TALLAS.includes(d.talla)) return { error: 'Selecciona una talla.' };
  const cantidad = Number(d.cantidad);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99) return { error: 'La cantidad debe ser un número entre 1 y 99.' };
  const nombre = String(d.nombre || '').trim();
  if (nombre.length < 2 || nombre.length > 80) return { error: 'Escribe tu nombre (2 a 80 caracteres).' };
  const correo = String(d.correo || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || correo.length > 100) return { error: 'Correo electrónico no válido.' };
  const telefono = String(d.telefono || '').replace(/\D/g, '');
  if (telefono.length < 7 || telefono.length > 15) return { error: 'Teléfono no válido (7 a 15 dígitos).' };
  const direccion = String(d.direccion || '').trim();
  if (direccion.length < 5 || direccion.length > 150) return { error: 'Escribe tu dirección de envío.' };

  // El precio SIEMPRE se toma del servidor, nunca del navegador
  return {
    pedido: {
      fecha: new Date().toLocaleString('sv-SE', { timeZone: 'America/Bogota' }),
      id_producto: producto.id,
      producto: producto.nombre,
      talla: d.talla,
      cantidad,
      precio_unitario: producto.precio,
      total: producto.precio * cantidad,
      nombre, correo, telefono, direccion
    }
  };
}

function responder(res, codigo, objeto) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(objeto));
}

function recibirPedido(req, res) {
  let cuerpo = '';
  req.on('data', trozo => {
    cuerpo += trozo;
    if (cuerpo.length > 10000) { req.destroy(); }
  });
  req.on('end', () => {
    let datos;
    try { datos = JSON.parse(cuerpo); } catch { return responder(res, 400, { ok: false, error: 'Datos inválidos.' }); }
    const r = validar(datos);
    if (r.error) return responder(res, 400, { ok: false, error: r.error });
    try {
      const id = guardarPedido(r.pedido);
      responder(res, 201, { ok: true, id_pedido: id, total: r.pedido.total });
    } catch (e) {
      console.error(e);
      responder(res, 500, { ok: false, error: 'No se pudo guardar. Si tienes BasedeDatos.csv abierto en Excel, ciérralo e inténtalo de nuevo.' });
    }
  });
}

function servirArchivo(req, res) {
  let ruta = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (ruta === '/') ruta = '/index.html';
  const completa = path.join(RAIZ, ruta);
  const tipo = TIPOS[path.extname(completa).toLowerCase()];
  // Solo se sirven los tipos de la lista (así server.js y el CSV no son públicos)
  if (!completa.startsWith(RAIZ + path.sep) || !tipo) { res.writeHead(404); return res.end('No encontrado'); }
  fs.readFile(completa, (err, contenido) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': tipo });
    res.end(contenido);
  });
}

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/pedidos') return recibirPedido(req, res);
  if (req.method === 'GET') return servirArchivo(req, res);
  res.writeHead(405); res.end();
}).listen(PUERTO, () => console.log(`Tienda lista en http://localhost:${PUERTO}`));
