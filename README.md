# Galeria Elaine & Jeferson

Galeria oficial do casamento de Elaine e Jeferson, em 27 de novembro de 2026.

Os convidados enviam fotos e videos pelo celular. Nada aparece na galeria publica antes da aprovacao do casal. Nao e preciso criar conta para ver ou baixar o que ja foi aprovado.

## Limitacao de material visual

Nao havia convite digital, fotografias do casal nem o arquivo `Elaine.zip` acessivel neste ambiente. O envio do ZIP na issue do GitHub falhou. A identidade visual foi criada no estilo de album editorial: papel marfim, tipografia serifada, monograma E & J e paleta terra/rose. Quando vocês tiverem uma foto do casal, substituam o quadro da pagina inicial.

## O que o sistema faz

- Pagina inicial com data, frase, botoes e QR Code para a recepcao
- Envio de varias fotos e videos, com previa, progresso e aviso de moderacao
- Galeria publica em mosaico, filtros, busca por nome, download e visualizacao ampliada
- Painel em `/admin` com login, estatisticas, aprovacao, rejeicao, exclusao e troca de senha
- Arquivos fora do banco de dados (pasta persistente ou S3/R2)
- SQLite no disco persistente, ou PostgreSQL se `DATABASE_URL` existir

## Como testar neste computador

1. Instale o Node.js 20 ou mais novo.
2. Na pasta do projeto:

```bash
npm --prefix backend install
npm --prefix frontend install
```

3. Copie as variaveis:

```bash
cp .env.example .env
```

4. No Linux/macOS, gere segredos:

```bash
openssl rand -hex 48
openssl rand -hex 32
```

Cole o primeiro em `SESSION_SECRET` e o segundo em `SETUP_TOKEN`.

5. Suba os dois servicos:

```bash
chmod +x start.sh
./start.sh
```

O site abre em `http://localhost:5173`. A API fica em `http://localhost:3001`. O frontend encaminha `/api` para o backend.

6. Ative o administrador em `http://localhost:5173/admin/ativar`
   - Token: o valor de `SETUP_TOKEN`
   - E-mail e senha de voces (a senha precisa ter pelo menos 10 caracteres, com letras e numeros)

7. Painel: `http://localhost:5173/admin`

## Como publicar no Render.com

Nao foi possivel acessar a conta do Render daqui. Siga estes passos no navegador.

### 1. Banco (opcional, mas recomendado)

No painel do Render: New + > PostgreSQL > plano Basic. Copie a Internal Database URL.

### 2. Disco para as fotos

O disco do servico web do Render some quando o servico reinicia, se voce nao anexar um disco. Crie um disco de 10 GB montado em `/var/data`.

### 3. Servico web

New + > Web Service > conecte o GitHub `JefersonElaine/E-J`.

- Runtime: Node
- Build: `npm --prefix frontend install && npm --prefix frontend run build && npm --prefix backend install`
- Start: `npm --prefix backend start`
- Health check: `/api/health`

Variaveis:

| Nome | Valor |
| --- | --- |
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | gerado com `openssl rand -hex 48` |
| `SETUP_TOKEN` | gerado com `openssl rand -hex 32` |
| `DATABASE_URL` | URL interna do PostgreSQL (ou vazio para SQLite em `/var/data`) |
| `DATA_DIR` | `/var/data` |
| `STORAGE_DRIVER` | `local` |
| `PUBLIC_URL` | `https://SEU-SERVICO.onrender.com` |

O arquivo `render.yaml` neste repositorio descreve a mesma estrutura. Voce pode usa-lo em New + > Blueprint.

### 4. Armazenamento mais seguro (S3 ou Cloudflare R2)

Para nao depender so do disco do Render, crie um bucket no Cloudflare R2 (em geral mais barato) ou na AWS S3 e preencha:

```
STORAGE_DRIVER=s3
S3_ENDPOINT=https://SEU_ID.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=elaine-jeferson
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=true
```

Os arquivos dos convidados nunca vao para o GitHub.

## Ativar a conta de administrador (producao)

1. Abra `https://SEU-SITE/admin/ativar`
2. Cole o `SETUP_TOKEN` que esta nas variaveis do Render (Environment)
3. Informe o e-mail do casal e uma senha forte
4. Guarde a senha em um lugar seguro. Ela nao fica no codigo.

Se esquecer a senha, use `/admin/recuperar` com o mesmo `SETUP_TOKEN`. Depois, troque o token nas variaveis de ambiente.

## Moderacao no dia do casamento

1. Entre em `/admin`
2. Filtre por Pendentes
3. Toque na miniatura para ver a foto ou o video
4. Selecione e clique em Aprovar (publica) ou Rejeitar (some da galeria publica)
5. O motivo da rejeicao e interno, os convidados nao veem

## Custos e limites (valores de referencia, podem mudar)

- Render Web Starter: cobrado ao mes; o plano gratuito, quando existir, dorme apos inatividade
- PostgreSQL Basic: cobrado ao mes
- Disco persistente: cobrado por GB
- Cloudflare R2: camada gratuita generosa para um casamento; cobre bem fotos de uma festa se os videos forem curtos

Este projeto nao promete gratuidade permanente nem armazenamento ilimitado. No codigo, o padrao e 12 MB por foto, 80 MB por video, 90 segundos e 10 arquivos por envio.

## Testes

Na pasta do projeto:

```bash
npm --prefix backend install
npm --prefix backend test
```

## Estrutura

```
backend/     API Node.js
frontend/    React + TypeScript
data/        Banco SQLite e arquivos (nao vai para o Git)
render.yaml  Modelo de publicacao no Render
```
