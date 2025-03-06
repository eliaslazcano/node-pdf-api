const emitirErro = (res, httpCode = 400, mensagem = '', errorId = 1, extra = {}) => {
  console.log(`|Erro: ${mensagem}|`);
  return res.status(httpCode).json({http: httpCode, mensagem, erro: errorId, dados: extra});
};

module.exports = {emitirErro};