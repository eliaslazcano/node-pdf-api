# API utilidades para PDF

Endpoints da API:

| Endpoint           | Descricao                                                                        |
|--------------------|----------------------------------------------------------------------------------|
| /test              | Para verificar o status da API e suas variaveis de ambiente                      |
| /juntar-urls       | Gera um arquivo PDF feito pela junção de arquivos que são passados via URL.      |
| /juntar-arquivos   | Gera um arquivo PDF feito pela junção de arquivos que são passados via FormData. |
| /comprimir-arquivo | Comprime um arquivo PDF enviado por FormData.                                    |
| /comprimir-imagem  | Comprime uma imagem enviada por FormData.                                        |

## Construir imagem

```bash
docker builder prune
docker build -t  eliaslazcano/pdfapi:1.3 .
```

## Executar o container

```bash
docker run -d -p 3000:3000 --name=pdfapi eliaslazcano/pdfapi:1.3
```