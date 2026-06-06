# Guía para armar el .tox de TouchDesigner MCP

Esta guía explica cómo construir manualmente un componente .tox que contenga
el servidor HTTP de TouchDesigner API listo para arrastrar a cualquier proyecto.

## ¿Qué es un .tox?

Un archivo `.tox` es un componente exportado de TouchDesigner. Al arrastrarlo
a un proyecto, crea un Base COMP con todo el contenido empaquetado.

## Paso a paso

### 1. Crear el Base COMP

1. En TouchDesigner, presiona `Tab` y busca **Base COMP** (o presiona `Ctrl+Shift+B`)
2. Asígnale un nombre reconocible, por ejemplo: `td_mcp_server`
3. Colócalo en una posición visible del network editor

### 2. Agregar el WebServer DAT

1. Dentro del Base COMP (doble clic para entrar), presiona `Tab`
2. Busca **WebServer DAT** y créalo
3. Configura sus parámetros:
   - **Active**: On
   - **Port**: `44444` (parámetro expuesto, ver paso 4)
   - **HTTP Methods**: GET, POST, PUT, DELETE
   - **Allow WAN**: según necesites (On para red local, Off para localhost)
   - **Index Pages**: dejar vacío
4. Conecta el output del WebServer DAT al input de un **Execute DAT**

### 3. Agregar el Text DAT con el script Python

1. Dentro del mismo Base COMP, presiona `Tab` y busca **Text DAT**
2. Asígnale el nombre `touchdesigner_api`
3. Pega el contenido generado por `mcp/setup/create_tox.py`

   Puedes generarlo corriendo:
   ```bash
   python mcp/setup/create_tox.py
   ```

   Esto imprimirá el código Python completo que debes pegar en el Text DAT.

4. Marca el Text DAT como **Python extension**:
   - En los parámetros del Text DAT, ve a la página **Common**
   - En **Extension**, marca **Enable**
   - En **Extension Module**, escribe el nombre del módulo: `TouchDesignerAPI`
   - En **Extension Class**, escribe: `TouchDesignerAPI`

### 4. Exponer parámetros en el Base COMP

Para que el usuario pueda configurar puerto y debug desde fuera:

1. Selecciona el Base COMP (nivel raíz)
2. Ve a los parámetros → pestaña **Custom** → botón **+**
3. Agrega dos parámetros:

   **Puerto (int):**
   - Name: `Port`
   - Label: `Puerto`
   - Style: **Int**
   - Default: `44444`

   **Debug (toggle):**
   - Name: `Debug`
   - Label: `Debug`
   - Style: **Toggle**
   - Default: `Off`

### 5. Conectar los parámetros expuestos

1. Dentro del Base COMP, selecciona el WebServer DAT
2. En el parámetro **Port**, haz clic derecho → **Export…**
3. Navega hacia arriba y selecciona el parámetro `Port` del Base COMP
4. Haz lo mismo para **Debug** si el WebServer DAT tiene modo debug

### 6. Configurar el Execute DAT

1. Selecciona el Execute DAT conectado al WebServer DAT
2. En sus parámetros:
   - **Execute On**: marca solo **HTTP Request**
   - **Script (callback)**: pega el siguiente código:

```python
def onHTTPRequest(dat, request):
    """Callback que recibe peticiones HTTP y las pasa a la extensión."""
    me = op('../touchdesigner_api')
    if me and hasattr(me, 'TouchDesignerAPI'):
        api = me.store('api')
        if api is None:
            api = me.TouchDesignerAPI()
            me.store('api', api)
        return api.handle_request(dat, request)
    return {'status': 500, 'body': 'API not initialized'}
```

### 7. Empaquetar como .tox

1. Selecciona el Base COMP raíz
2. Menú **Component** → **Export Tox…** (o presiona `Ctrl+E`)
3. Elige nombre y ubicación (ej: `TouchDesigner_MCP_Server.tox`)
4. Asegúrate de que **External** esté **desmarcado**
5. Guarda

## Verificación

1. Arrastra el .tox a un nuevo proyecto de TouchDesigner
2. Verifica que el Base COMP se cree con los parámetros expuestos:
   - **Port** (int, default 44444)
   - **Debug** (toggle)
3. Abre un navegador en `http://localhost:44444/info`
4. Deberías ver una respuesta JSON con información de TouchDesigner

## Contenido del .tox (resumen)

| Componente      | Tipo        | Descripción                              |
|-----------------|-------------|------------------------------------------|
| Base COMP       | `td_mcp_server` | Contenedor principal                 |
| WebServer DAT   | `webserver1` | Servidor HTTP en puerto configurable     |
| Text DAT        | `touchdesigner_api` | Extensión Python TouchDesignerAPI |
| Execute DAT     | `execute1`   | Callback HTTP → extensión                |

## Notas

- El .tox exportado contiene TODO lo necesario: servidor web + API Python
- El usuario solo necesita arrastrar el .tox a su proyecto
- Los parámetros expuestos permiten cambiar puerto y debug sin entrar al COMP
- Para producción, recomienda mantener el puerto 44444 por defecto
