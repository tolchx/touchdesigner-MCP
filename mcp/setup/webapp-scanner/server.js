const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

const execPromise = util.promisify(exec);
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Path to toeexpand executable
const TOEEXPAND_PATH = '"C:\\Program Files\\Derivative\\TouchDesigner\\bin\\toeexpand.exe"';

// Endpoint to scan a directory for .toe files
app.get('/api/scan', (req, res) => {
    const dirPath = req.query.path;
    if (!dirPath || !fs.existsSync(dirPath)) {
        return res.status(400).json({ error: 'Directorio inválido o no existe' });
    }

    try {
        const files = fs.readdirSync(dirPath);
        const toeFiles = files
            .filter(f => f.toLowerCase().endsWith('.toe'))
            .map(f => path.join(dirPath, f));
        
        res.json({ files: toeFiles });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper to generate README based on directory contents
function generateReadme(projectName, expandedDir) {
    let componentsList = '';
    try {
        if (fs.existsSync(expandedDir)) {
            const items = fs.readdirSync(expandedDir);
            componentsList = items.map(item => `- **${item}**`).join('\n');
        }
    } catch (e) {
        console.error('Error reading expanded dir', e);
    }

    return `# ${projectName} - TouchDesigner Project\n\n` +
           `Este es un proyecto de TouchDesigner descomprimido automáticamente.\n\n` +
           `## Estructura del Proyecto\n\n` +
           `${componentsList || 'No se pudo leer la estructura interna.'}\n\n` +
           `## Contexto\n\n` +
           `Proyecto expandido para permitir control de versiones (Git) y análisis de nodos.\n` +
           `Usa \`toecollapse.exe\` apuntando al archivo \`.toc\` para volver a comprimir el proyecto en formato \`.toe\`.\n`;
}

// Helper to generate Trae Skill
function generateSkill(projectName, expandedDir) {
    const workspaceRoot = path.resolve(__dirname, '..'); // Assuming webapp is inside claude-touchdesigner
    const skillsDir = path.join(workspaceRoot, '.trae', 'skills', projectName);
    
    if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true });
    }

    const skillContent = `---
name: "${projectName}"
description: "Proporciona contexto y detalles arquitectónicos sobre el proyecto TouchDesigner ${projectName}. Invocalo cuando el usuario pregunte por este proyecto o necesite modificarlo."
---

# Skill del Proyecto: ${projectName}

## Descripción
Este skill asiste en la modificación y comprensión del proyecto TouchDesigner **${projectName}**.
El proyecto se encuentra expandido en el sistema de archivos para permitir su análisis.

## Directorio Base
\`${expandedDir}\`

## Tareas comunes
- Análisis de la red de nodos leyendo los archivos \`.n\` y \`.parm\`.
- Revisión de scripts de python (\`.py\`) o GLSL (\`.glsl\`) integrados.
- Ayuda en el control de versiones del proyecto.
`;

    fs.writeFileSync(path.join(skillsDir, 'SKILL.md'), skillContent, 'utf-8');
}

app.post('/api/process', async (req, res) => {
    const { files, outputDir } = req.body;
    
    if (!files || !Array.isArray(files)) {
        return res.status(400).json({ error: 'Se requiere una lista de archivos' });
    }

    const results = [];

    for (const file of files) {
        const projectName = path.basename(file, '.toe');
        const originalDir = path.dirname(file);
        
        try {
            console.log(`Procesando ${file}`);
            
            // Ejecutar toeexpand (ignoramos el error inicial porque toeexpand suele devolver exit code 1 y logs a stderr aunque funcione)
            try {
                await execPromise(`${TOEEXPAND_PATH} "${file}"`);
            } catch (execErr) {
                // Se ignora deliberadamente para comprobar los archivos
            }

            const generatedDir = `${file}.dir`;
            const generatedToc = `${file}.toc`;

            if (!fs.existsSync(generatedDir) || !fs.existsSync(generatedToc)) {
                throw new Error("El comando falló y no se generaron los archivos .dir o .toc esperados.");
            }

            // Crear carpeta contenedora principal para el proyecto
            const baseOutDir = outputDir || originalDir;
            const projectWrapperDir = path.join(baseOutDir, projectName);
            if (!fs.existsSync(projectWrapperDir)) {
                fs.mkdirSync(projectWrapperDir, { recursive: true });
            }

            // Rutas destino dentro de la carpeta contenedora
            const fileName = path.basename(file);
            const targetDir = path.join(projectWrapperDir, `${fileName}.dir`);
            const targetToc = path.join(projectWrapperDir, `${fileName}.toc`);
            const targetToe = path.join(projectWrapperDir, fileName);

            // Mover los archivos generados a la nueva carpeta
            if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
            fs.renameSync(generatedDir, targetDir);
            
            if (fs.existsSync(targetToc)) fs.rmSync(targetToc, { force: true });
            fs.renameSync(generatedToc, targetToc);

            // Copiar el archivo .toe original para tener todo agrupado
            fs.copyFileSync(file, targetToe);

            // Generar README en la carpeta principal del proyecto
            const readmeContent = generateReadme(projectName, targetDir);
            fs.writeFileSync(path.join(projectWrapperDir, 'README.md'), readmeContent, 'utf-8');

            // Generar Skill apuntando a la carpeta contenedora
            generateSkill(projectName, projectWrapperDir);

            results.push({ file, status: 'success', projectName, dir: projectWrapperDir });
        } catch (error) {
            console.error(`Error processing ${file}:`, error);
            results.push({ file, status: 'error', error: error.message });
        }
    }

    res.json({ results });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
