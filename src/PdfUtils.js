const {rgb} = require('pdf-lib');
const pdftk = require('node-pdftk');

/**
 * Escreve no documento, deixando visível o número da página de acordo com os parametros informados.
 * @param PDFPage Instancia de PDFPage.
 * @param nrPagina Número para escrever na página.
 */
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

/**
 * Comprime um arquivo PDF usando o PDFTK. (Uma leve compressão nativa do algoritmo da Adobe).
 * @param {string} filepath Caminho completo para o arquivo de origem, incluindo o nome.
 * @param {string} output Caminho completo para o arquivo de saída, incluindo o nome.
 * @return {Promise<Buffer>}
 */
const comprimirComPdftk = (filepath, output) => {
  return pdftk.input(filepath).compress().output(output);
}

module.exports = {escreverPaginacao};