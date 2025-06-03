const express = require('express');
const app = express();
const PORT = process.env.PORT || 3333;

app.use(express.json());

app.get('/hello', (req, res) => {
  res.send('Γεια σου από το backend!');
});

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
