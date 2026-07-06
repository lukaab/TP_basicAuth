const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const isAuthenticated = require('../middlewares/authCheck');

const router = express.Router();

router.get('/bat-computer', isAuthenticated, (req, res) => {
  const filePath = path.join(__dirname, '..', 'views', 'bat-computer.html');
  const html = fs.readFileSync(filePath, 'utf-8');

  const personalizedHtml = html.replace('{{username}}', req.session.user.username);

  res.send(personalizedHtml);
});

router.get('/api/me', isAuthenticated, (req, res) => {
  res.json({
    id: req.session.user.id,
    username: req.session.user.username
  });
});

router.get('/api/secrets', isAuthenticated, (req, res) => {
  res.json([
    {
      name: 'Batarang',
      desc: 'Arme de jet en forme de chauve-souris',
      icon: 'fa-shuriken'
    },
    {
      name: 'Grapnel Gun',
      desc: 'Grappin permettant de se déplacer rapidement',
      icon: 'fa-arrow-up'
    },
    {
      name: 'Batmobile',
      desc: 'Véhicule blindé haute technologie',
      icon: 'fa-car'
    }
  ]);
});

router.post('/api/reports', isAuthenticated, (req, res) => {
  const { content } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).send('Le rapport ne peut pas être vide.');
  }

  db.prepare(`
    INSERT INTO reports (user_id, content)
    VALUES (?, ?)
  `).run(req.session.user.id, content.trim());

  return res.status(201).send('Rapport enregistré.');
});

module.exports = router;