const path = require('path');
const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..')));

const insertStmt = db.prepare(`
  INSERT INTO submissions
    (company_name, industry, employee_count, revenue_range, answers, multi_answers, materiality_answers, report)
  VALUES (@company_name, @industry, @employee_count, @revenue_range, @answers, @multi_answers, @materiality_answers, @report)
`);

const listStmt = db.prepare(`
  SELECT id, company_name, industry, employee_count, revenue_range, created_at
  FROM submissions
  ORDER BY id DESC
`);

const getStmt = db.prepare(`SELECT * FROM submissions WHERE id = ?`);

function parseRow(row) {
  return {
    ...row,
    answers: JSON.parse(row.answers),
    multi_answers: JSON.parse(row.multi_answers),
    materiality_answers: JSON.parse(row.materiality_answers),
    report: JSON.parse(row.report),
  };
}

app.post('/api/submissions', (req, res) => {
  const { answers = {}, multiAnswers = {}, materialityAnswers = {}, report = {} } = req.body || {};

  if (typeof answers !== 'object' || typeof multiAnswers !== 'object' || typeof materialityAnswers !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const result = insertStmt.run({
    company_name: answers.companyName || null,
    industry: answers.q1 || null,
    employee_count: answers.q2 || null,
    revenue_range: answers.q3 || null,
    answers: JSON.stringify(answers),
    multi_answers: JSON.stringify(multiAnswers),
    materiality_answers: JSON.stringify(materialityAnswers),
    report: JSON.stringify(report),
  });

  res.status(201).json({ id: result.lastInsertRowid });
});

app.get('/api/submissions', (req, res) => {
  res.json(listStmt.all());
});

app.get('/api/submissions/:id', (req, res) => {
  const row = getStmt.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parseRow(row));
});

app.listen(PORT, () => {
  console.log(`ESG diagnostic backend listening on http://localhost:${PORT}`);
});
