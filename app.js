const express = require('express');
const axios = require('axios');
const { PDFDocument, rgb } = require('pdf-lib');

const app = express();
app.use(express.json()); //Habilita o interpretador de JSON do Express, caso contrario ele nao saberia o que é JSON.

const porta = process.env.PORT || 3000;
app.listen(porta, () => console.log(`SERVIDOR LIGADO. PORTA: ${porta}.`));

const responderErro = (res, httpCode = 400, mensagem = '', errorId = 1, extra = {}) => {
  return res.status(httpCode).json({http: httpCode, mensagem, erro: errorId, dados: extra});
};

app.get('/', (req, res) => res.json('TESTE BEM SUCEDIDO'));

app.post('/juntar-urls', async (req, res) => {
  if (!req.is('json')) return responderErro(res, 400, `A requisição não é JSON.`, 1);
  if (!req.body?.urls) return responderErro(res, 400, `O JSON enviado está incompleto, falta o parâmetro "urls" em formato Array.`, 2);
  if (!Array.isArray(req.body.urls)) return responderErro(res, 400, `O JSON enviado está incorreto, o parâmetro "urls" não está em formato Array, envie um Array de strings.`, 3);
  if (req.body.urls.length === 0) return responderErro(res, 400, `O JSON enviado está incorreto, o parâmetro "urls" está vazio.`, 4);

  /** @type {string[]} */
  const urls = req.body.urls.filter(i => !!i && typeof i === 'string');
  const naoPaginar = req.body?.paginacao === false || req.body?.paginacao === null;

  let limiteTempoAtingido = false;
  const controller = new AbortController();
  const httpRequisicoes = urls.map(i => axios.get(i, {responseType: 'arraybuffer', signal: controller.signal}));
  const timeoutId = setTimeout(() => {
    limiteTempoAtingido = true;
    controller.abort();
  }, 60000);

  let httpRespostas = [];
  try {
    httpRespostas = await Promise.all(httpRequisicoes);
  } catch (e) {
    if (limiteTempoAtingido) return responderErro(res, 500, 'O download dos documentos para juntar está tomando tempo demais, seus documentos podem ser grandes demais para juntar. Operação cancelada por prevenção a sobrecarga. Tente comprimir o documento antes ou reduza a quantidade.', 5);
    return responderErro(res, 400, 'O download dos documentos falhou. Um de seus documentos pode estar corrompido (com defeito) ou ser grande demais para juntar.', 6);
  } finally {
    clearTimeout(timeoutId);
  }

  const buffers = httpRespostas.map(i => i.data);
  const tamanhoTotal = buffers.reduce((carry, i) => carry + i.byteLength, 0);
  if (tamanhoTotal > 104857600) return responderErro(res, 400, 'Você ultrapassou o limite de segurança de 100MB. O arquivo é muito grande para ser combinado. Tente comprimi-lo antes ou reduza a quantidade de arquivos. Os softwares de leitura podem apresentar problemas com este tamanho exagerado e as atividades dos outros usuários podem sofrer interrupções por sobrecarga na rede.', 7);

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
  };

  //A partir daqui começa a construção do documento juntado
  const pdfDoc = await PDFDocument.create();
  let paginaAtual = 1;
  for (let i = 0; i < buffers.length; i++) {
    const contentType = httpRespostas[i].headers.get('content-type');
    if (contentType === 'application/pdf') {
      const pdfDocumento = await PDFDocument.load(buffers[i]);
      const pageCount = pdfDocumento.getPageCount();
      for (let a = 0; a < pageCount; a++) {
        const [existingPage] = await pdfDoc.copyPages(pdfDocumento, [a]);
        const page = pdfDoc.addPage(existingPage);
        if (!naoPaginar) escreverPaginacao(page, paginaAtual++);
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
      if (!naoPaginar) escreverPaginacao(page, paginaAtual++);
    }
  }

  const pdfSaved = await pdfDoc.save();
  //console.log('length: ', pdfSaved.length);
  res.set('Content-Type', 'application/pdf');
  res.send(Buffer.from(pdfSaved));
});