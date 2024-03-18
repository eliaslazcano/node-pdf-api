const express = require('express');
const {PDFDocument, rgb} = require('pdf-lib');

const app = express();
app.use(express.json()); //Habilita o interpretador de JSON do Express, caso contrario ele nao saberia o que é JSON.

const porta = process.env.PORT || 3000;
app.listen(porta, () => console.log(`SERVIDOR LIGADO. PORTA: ${porta}.`));

const emitirErro = (res, httpCode = 400, mensagem = '', errorId = 1, extra = {}) => {
  return res.status(httpCode).json({http: httpCode, mensagem, erro: errorId, dados: extra});
}

app.get('/', (req, res, next) => {
  res.json('END POINT DE TESTE');
});

app.post('/juntar', async (req, res) => {
  if (!req.is('json')) return emitirErro(res, 400, `A requisição não é JSON.`, 1);
  if (!req.body?.urls) return emitirErro(res, 400, `O JSON enviado está incompleto, falta o parâmetro "urls" em formato Array.`, 2);
  if (!Array.isArray(req.body.urls)) return emitirErro(res, 400, `O JSON enviado está incorreto, o parâmetro "urls" não está em formato Array, envie um Array de strings.`, 3);
  if (req.body.urls.length === 0) return emitirErro(res, 400, `O JSON enviado está incorreto, o parâmetro "urls" está vazio.`, 4);

  const urls = req.body.urls.filter(i => !!i && typeof i === 'string');
  const httpRequisicoes = urls.map(i => fetch(i)); //Baixa os arquivos usando FETCH API
  const httpRespostas = await Promise.all(httpRequisicoes);
  for (const i of httpRespostas) if (!i.ok) return emitirErro(res, 400, `Ocorreu um erro ao tentar realizar o download de um dos arquivos para junção.`, 7, {url: i.url});
  const buffers = await Promise.all(httpRespostas.map(i => i.arrayBuffer()));

  const escreverPaginacao = (PDFPage, nrPagina) => {
    if (typeof nrPagina !== 'number') nrPagina = parseInt(nrPagina);
    PDFPage.drawRectangle({
      x: (PDFPage.getWidth() - 22) ,
      y: 3 ,
      width: 50,
      height: 12,
      borderWidth: 1,
      borderColor: rgb(0.7, 0.7, 0.7),
      color: rgb(1, 1, 1),
      opacity: 1,
      borderOpacity: 1
    });
    PDFPage.drawText(nrPagina.toString(), {
      x: (PDFPage.getWidth() - (nrPagina >= 100 ? 20 : (nrPagina >= 10 ? 18 : 14))),
      y: 5,
      size: 11,
      color: rgb(0, 0, 0)
    });
  }

  const pdfDoc = await PDFDocument.create();

  //A partir daqui começa a junção
  let paginaAtual = 1;
  for (let i = 0; i < buffers.length; i++) {
    const contentType = httpRespostas[i].headers.get('content-type');
    if (contentType === 'application/pdf') {
      const pdfDocumento = await PDFDocument.load(buffers[i]);
      const pageCount = pdfDocumento.getPageCount();
      for (let a = 0; a < pageCount; a++) {
        const [existingPage] = await pdfDoc.copyPages(pdfDocumento, [a]);
        const page = pdfDoc.addPage(existingPage);
        escreverPaginacao(page, paginaAtual++);
      }
    }
    else if (contentType === 'image/jpeg' || contentType === 'image/png') {
      const img = (contentType === 'image/jpeg') ? await pdfDoc.embedJpg(buffers[i]) : await pdfDoc.embedPng(buffers[i]);
      const page = pdfDoc.addPage();
      const {width, height} = page.getSize();
      const scale = Math.min(width / img.width, height / img.height);
      const x = (width - (img.width * scale)) / 2;
      const y = (height - (img.height * scale)) / 2;
      page.drawImage(img, {x, y, width: img.width * scale, height: img.height * scale});
      escreverPaginacao(page, paginaAtual++);
    }
  }

  const pdfSaved = await pdfDoc.save();
  //console.log('length: ', pdfSaved.length);
  res.set('Content-Type', 'application/pdf');
  res.send(Buffer.from(pdfSaved));
});