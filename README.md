# Teste de API do Relógio de Ponto

Esta pasta contém uma página de diagnóstico para testar a API interna da empresa e um servidor local mínimo que faz o papel de proxy same-origin para evitar bloqueios de CORS no navegador.

## Como executar

1. Abra um terminal na pasta `teste`.
2. Inicie o servidor local:

```bash
node server.js
```

3. Abra no navegador:

```text
http://localhost:8787
```

4. Na interface, deixe o modo de conexão em `Via proxy same-origin`.
5. Clique em `Executar teste` para disparar a chamada.

## Como funciona

- A página envia a requisição para o proxy local em `http://localhost:8787/api/proxy`.
- O proxy faz a chamada real para a API interna `http://192.168.001.43/login.fcgi`.
- O navegador só conversa com o servidor local, então o bloqueio de CORS deixa de acontecer no front.

## Arquivos

- [teste/index.html](teste/index.html): interface de teste da API.
- [teste/server.js](teste/server.js): servidor local com proxy.

## Observações

- Se quiser testar sem proxy, altere o modo de conexão na interface para `Direto para a API`.
- Se a API interna exigir credenciais, ajuste os campos de login, senha, headers e body antes de executar.
