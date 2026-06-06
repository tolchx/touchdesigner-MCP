document.getElementById('scanBtn').addEventListener('click', async () => {
    const dirPath = document.getElementById('dirPath').value;
    const fileListContainer = document.getElementById('fileListContainer');
    const fileList = document.getElementById('fileList');

    if (!dirPath) return alert('Ingresa una ruta de directorio');

    try {
        const response = await fetch(`/api/scan?path=${encodeURIComponent(dirPath)}`);
        const data = await response.json();

        if (data.error) {
            alert(`Error: ${data.error}`);
            return;
        }

        fileList.innerHTML = '';
        if (data.files.length === 0) {
            fileList.innerHTML = '<li>No se encontraron archivos .toe en la ruta especificada.</li>';
        } else {
            data.files.forEach((file) => {
                const li = document.createElement('li');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = file;
                checkbox.checked = true;

                const label = document.createElement('label');
                label.textContent = file.split('\\').pop(); // Show only filename

                li.appendChild(checkbox);
                li.appendChild(label);
                fileList.appendChild(li);
            });
        }
        
        fileListContainer.classList.remove('hidden');

    } catch (err) {
        alert('Error conectando al servidor');
    }
});

document.getElementById('processBtn').addEventListener('click', async () => {
    const checkboxes = document.querySelectorAll('#fileList input[type="checkbox"]:checked');
    const selectedFiles = Array.from(checkboxes).map(cb => cb.value);
    const outputDir = document.getElementById('outPath').value;

    if (selectedFiles.length === 0) {
        alert('Selecciona al menos un archivo para descomprimir.');
        return;
    }

    const statusContainer = document.getElementById('statusContainer');
    const statusLogs = document.getElementById('statusLogs');
    statusContainer.classList.remove('hidden');
    statusLogs.innerHTML = ''; // Clear logs
    
    appendLog('Iniciando proceso por lotes...', 'log-info');

    try {
        const response = await fetch('/api/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: selectedFiles, outputDir: outputDir || null })
        });
        
        const data = await response.json();

        if (data.error) {
            appendLog(`Error crítico: ${data.error}`, 'log-error');
            return;
        }

        data.results.forEach(result => {
            if (result.status === 'success') {
                appendLog(`✅ Éxito: ${result.projectName}`, 'log-success');
                appendLog(`  -> Descomprimido en: ${result.dir}`, 'log-info');
                appendLog(`  -> README.md generado`, 'log-info');
                appendLog(`  -> Skill Trae generado`, 'log-info');
            } else {
                appendLog(`❌ Error en: ${result.file}`, 'log-error');
                appendLog(`  -> ${result.error}`, 'log-error');
            }
            appendLog('------------------------------------');
        });

        appendLog('Proceso finalizado.', 'log-info');

    } catch (err) {
        appendLog('Error de conexión al procesar los archivos.', 'log-error');
    }
});

function appendLog(message, className = '') {
    const statusLogs = document.getElementById('statusLogs');
    const div = document.createElement('div');
    div.textContent = message;
    if (className) div.className = className;
    statusLogs.appendChild(div);
    statusLogs.scrollTop = statusLogs.scrollHeight;
}