const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const port = 3000;

app.use(bodyParser.json());
// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Rota para servir o arquivo index.html quando acessar a raiz do site
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const db = new sqlite3.Database(':memory:');

db.serialize(() => {
    db.run("CREATE TABLE players (id INTEGER PRIMARY KEY, name TEXT, lives INTEGER)");
});

app.get('/players', (req, res) => {
    db.all("SELECT * FROM players", (err, rows) => {
        if (err) {
            res.status(500).send(err.message);
            return;
        }
        res.json(rows);
    });
});

app.post('/players', (req, res) => {
    const { name, lives } = req.body;
    db.run("INSERT INTO players (name, lives) VALUES (?, ?)", [name, lives], function(err) {
        if (err) {
            res.status(500).send(err.message);
            return;
        }
        res.status(201).json({ id: this.lastID, name, lives });
    });
});

app.put('/players/:id', (req, res) => {
    const { lives } = req.body;
    const { id } = req.params;
    db.run("UPDATE players SET lives = ? WHERE id = ?", [lives, id], function(err) {
        if (err) {
            res.status(500).send(err.message);
            return;
        }
        res.json({ id, lives });
    });
});

app.delete('/players/:id', (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM players WHERE id = ?", [id], function(err) {
        if (err) {
            res.status(500).send(err.message);
            return;
        }
        res.status(204).send();
    });
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
