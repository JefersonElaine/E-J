# Galeria Elaine & Jeferson

Site de fotos e videos do casamento, feito para ser aberto pelo celular via QR Code nas mesas.

## Como rodar

```bash
# Instale as dependencias
npm install

# Copie o arquivo de exemplo e preencha usuario e senha do admin
cp .env.example .env

# Inicie o servidor
npm start
```

O site abre em `http://localhost:3000`.
O painel fica em `http://localhost:3000/admin`.

## Onde configurar usuario e senha

A senha **nao** fica no codigo. Edite o arquivo `.env` (ele nao vai para o GitHub):

```
PORT=3000
ADMIN_USER=elaine
ADMIN_PASSWORD=sua-senha-forte
SESSION_SECRET=uma-chave-longa-e-aleatoria
MAX_IMAGE_MB=15
MAX_VIDEO_MB=80
```

O primeiro administrador e criado automaticamente a partir de `ADMIN_USER` e `ADMIN_PASSWORD` na primeira inicializacao. Depois disso, voce pode:

- trocar a senha no painel (`/admin`, secao no final da pagina)
- criar outros administradores no mesmo painel

Se o site estiver no Render, Railway, Fly.io ou similar, coloque essas mesmas chaves em **Environment Variables** do painel do provedor.

## Armazenamento

Fotos, videos e o banco simples ficam em `data/` (pasta ignorada pelo Git). Enquanto esse diretorio existir, os arquivos nao somem ao reiniciar o servidor.

## QR Code

Com o site no ar, acesse `/qr.png` para baixar o QR Code em alta resolucao apontando para a pagina publica.
