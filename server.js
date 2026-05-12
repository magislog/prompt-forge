const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3333;
const DATA_FILE = path.join(__dirname, 'prompt-data.json');

app.use(express.json({limit: '50mb'}));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'prompt-forge.html'));
});

app.get('/api/load', (req, res) => {
  if (!fs.existsSync(DATA_FILE)) {
    return res.json({ genres: [], headerImgs: [], miniImgs: [], templates: [] });
  }
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    res.json(data);
  } catch {
    res.json({ genres: [], headerImgs: [], miniImgs: [], templates: [] });
  }
});

app.post('/api/save', (req, res) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log('Prompt Forge サーバー起動中: http://localhost:' + PORT);
});
