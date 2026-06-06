# TouchDesigner MCP — Guía de configuración

## Requisitos

- **Node.js** v18 o superior (descargar de https://nodejs.org)
- **TouchDesignER** 2022.28000+ (Build 2022.28000 o superior)
- **npm** (incluido con Node.js)

## Instalación rápida

```bash
# Ir al directorio del servidor MCP
cd touchdesigner/mcp

# Correr el instalador interactivo
node install.mjs
```

El instalador hará todo automáticamente:
1. Verifica Node.js y npm
2. Instala dependencias (`npm install`)
3. Compila TypeScript (`npx tsc`)
4. Pregunta IP y puerto de TouchDesigner
5. Crea archivo `.env` con la configuración
6. (Linux/WSL) Ofrece instalar como servicio systemd
7. Muestra instrucciones para conectar Claude Desktop

## Instalación manual

Si prefieres hacerlo paso a paso:

```bash
# 1. Instalar dependencias
cd touchdesigner/mcp
npm install

# 2. Compilar TypeScript
npx tsc

# 3. Configurar variables de entorno
export TDAPI_HOST=localhost
export TDAPI_PORT=44444

# 4. Crear archivo .env (opcional, lectura automática)
cat > .env << 'EOF'
TDAPI_HOST=localhost
TDAPI_PORT=44444
EOF
```

## Configurar TouchDesigner

Hay dos formas de preparar TouchDesigner:

### Opción A: Usar el archivo .toe existente

Abre `touchdesigner/toe/develop.toe` en TouchDesigner. Este archivo ya incluye
el TouchDesignerAPI ejecutándose en el puerto 44444.

### Opción B: Armar el .tox manualmente

Sigue la guía en `mcp/setup/tox_instructions.md` para construir tu propio
componente .tox desde cero.

## Conectar con Claude Desktop

### Opción 1: One-click con .mcpb

Haz doble clic en `touchdesigner/mcp/mcp-bundle.json`. Claude Desktop lo
detectará automáticamente y ofrecerá instalar el servidor MCP.

### Opción 2: Configuración manual

Abre Claude Desktop → Settings → Developer → MCP Servers y agrega:

```json
{
  "mcpServers": {
    "touchdesigner": {
      "command": "node",
      "args": ["/ruta/completa/a/touchdesigner/mcp/dist/index.js"],
      "env": {
        "TDAPI_HOST": "localhost",
        "TDAPI_PORT": "44444"
      }
    }
  }
}
```

Reemplaza la ruta con la ubicación real en tu sistema.

**Importante para WSL:** Si usas Claude Desktop en Windows y el servidor MCP
está en WSL, la ruta debe ser la ruta WSL (ej: `\\wsl.localhost\Ubuntu\home\...`),
o puedes ejecutar el servidor directamente desde Windows usando Node.js para Windows.

## Variables de entorno

| Variable      | Default     | Descripción                              |
|---------------|-------------|------------------------------------------|
| `TDAPI_HOST`  | `localhost` | Host/IP de TouchDesigner                 |
| `TDAPI_PORT`  | `44444`     | Puerto HTTP del API de TD                |

## Verificar que funciona

```bash
# Iniciar el servidor MCP manualmente
cd touchdesigner/mcp
node dist/index.js

# En otra terminal, probar la conexión:
curl -s http://localhost:44444/info
```

Si ves un JSON con información de TouchDesigner, ¡todo está funcionando!

## Solución de problemas

### "Node.js no encontrado"
- Descarga Node.js desde https://nodejs.org (versión LTS recomendada)
- Asegúrate de que `node` y `npm` estén en el PATH

### "Conexión rechazada"
- Verifica que TouchDesigner esté corriendo
- Verifica que el .toe con TouchDesignerAPI esté abierto
- Confirma que el puerto 44444 no está bloqueado por firewall
- Si usas WSL, la IP de TD no es `localhost` sino la IP de Windows (ej: `172.x.x.x`)
  Corre `ipconfig` en Windows para obtenerla

### "Error de compilación TypeScript"
- Asegúrate de tener TypeScript 5.x instalado (`npx tsc --version`)
- Prueba borrar `node_modules` y correr `npm install` de nuevo

### El servidor MCP no aparece en Claude Desktop
- Revisa la configuración en Claude Desktop → Settings → Developer
- Verifica que la ruta a `dist/index.js` sea correcta y absoluta
- Revisa el log de Claude Desktop para errores del servidor MCP
