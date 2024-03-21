const {rgb} = require('pdf-lib');

const responderErro = (res, httpCode = 400, mensagem = '', errorId = 1, extra = {}) => {
  return res.status(httpCode).json({http: httpCode, mensagem, erro: errorId, dados: extra});
};

const tamanhoHumanizado = (bytes, binary = true) => {
  const base = binary ? 1024 : 1000;
  if (bytes < base) return `${bytes} B`;
  const prefix = ['K', 'M', 'G'];
  let unit = -1;
  while (Math.abs(bytes) >= base && unit < prefix.length - 1) {
    bytes /= base;
    ++unit;
  }
  return `${bytes.toFixed(1)} ${prefix[unit]}B`;
};

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

module.exports = {tamanhoHumanizado, responderErro, escreverPaginacao};