const { createCanvas, loadImage } = require('canvas');

/**
 * Gera uma versão comprimida da imagem para otimizar seu peso.
 * @param {Buffer} buffer Buffer da imagem.
 * @param {number} outputQuality Qualidade da imagem entre 0 (pior) e 1 (melhor).
 * @param {?number} maxWidth Largura máxima permitida da imagem em pixels; a imagem será redimensionada se ultrapassar esse limite.
 * @param {?number} maxHeight Altura máxima permitida da imagem em pixels; a imagem será redimensionada se ultrapassar esse limite.
 * @param {string} outputType Formato da imagem da saída, pode ser 'image/jpeg' ou 'image/png'.
 * @returns {Promise<Buffer>} Caminho do arquivo da imagem comprimida.
 */
const comprimirImagem = async (buffer, outputQuality = 0.96, maxWidth = null, maxHeight = null, outputType = 'image/jpeg') => {
  const image = await loadImage(buffer);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');

  if ((maxWidth && image.width > maxWidth) || (maxHeight && image.height > maxHeight)) {
    const ratio = Math.min(maxWidth / image.width, maxHeight / image.height);
    canvas.width = image.width * ratio;
    canvas.height = image.height * ratio;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.drawImage(image, 0, 0, image.width, image.height);
  }
  return canvas.toBuffer(outputType, {quality: outputQuality, compressionLevel: 6});
};

module.exports = { comprimirImagem };