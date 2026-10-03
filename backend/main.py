import os
import random
import string
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor
import json
import unicodedata

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_URL = os.getenv("DATABASE_URL", "postgresql://admin:adminpassword@localhost:5432/wordhunt")

def get_db_connection():
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)

class JogoCreate(BaseModel):
    id_professor: int
    disciplina: str
    assunto: str
    dificuldade: str
    perguntas_respostas: list

def remover_acentos(texto):
    return ''.join(c for c in unicodedata.normalize('NFD', texto) if unicodedata.category(c) != 'Mn')

def gerar_matriz(palavras_lista, dificuldade):
    tamanho = 15
    matriz = [['' for _ in range(tamanho)] for _ in range(tamanho)]
    
    for palavra in palavras_lista:
        # Agora o backend tira acentos e espaços, deixando a lista original intacta
        palavra_limpa = remover_acentos(palavra).upper().replace(" ", "")
        colocado = False
        tentativas = 0
        while not colocado and tentativas < 200:
            seletor_direcao = [(0,1), (1,0)] # Direita, Baixo
            if dificuldade != "Fácil":
                seletor_direcao.extend([(1,1), (-1,-1), (0,-1), (-1,0), (1,-1), (-1,1)])
            
            dir_x, dir_y = random.choice(seletor_direcao)
            linha = random.randint(0, tamanho - 1)
            coluna = random.randint(0, tamanho - 1)
            
            fim_linha = linha + dir_x * (len(palavra_limpa) - 1)
            fim_coluna = coluna + dir_y * (len(palavra_limpa) - 1)
            
            if 0 <= fim_linha < tamanho and 0 <= fim_coluna < tamanho:
                sobreposicao_valida = True
                for i, char in enumerate(palavra_limpa):
                    r = linha + dir_x * i
                    c = coluna + dir_y * i
                    if matriz[r][c] != '' and matriz[r][c] != char:
                        sobreposicao_valida = False
                        break
                
                if sobreposicao_valida:
                    for i, char in enumerate(palavra_limpa):
                        r = linha + dir_x * i
                        c = coluna + dir_y * i
                        matriz[r][c] = char
                    colocado = True
            tentativas += 1

    # Preencher espaços vazios
    for r in range(tamanho):
        for c in range(tamanho):
            if matriz[r][c] == '':
                matriz[r][c] = random.choice(string.ascii_uppercase)
    return matriz

@app.get("/api/usuarios")
def get_usuarios():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM Usuario;")
    usuarios = cur.fetchall()
    conn.close()
    return usuarios

@app.post("/api/jogos")
def criar_jogo(jogo: JogoCreate):
    conn = get_db_connection()
    cur = conn.cursor()
    
    # Extrair apenas as palavras para o gerador
    palavras = [pr["resposta"] for pr in jogo.perguntas_respostas]
    matriz = gerar_matriz(palavras, jogo.dificuldade)
    
    try:
        cur.execute("""
            INSERT INTO Caca_Palavras (id_professor, disciplina, assunto, dificuldade, perguntas_respostas, matriz_letras)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id_jogo;
        """, (jogo.id_professor, jogo.disciplina, jogo.assunto, jogo.dificuldade, json.dumps(jogo.perguntas_respostas), json.dumps(matriz)))
        
        id_jogo = cur.fetchone()['id_jogo']
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail="Erro ao salvar jogo. Verifique se o assunto já existe para esta disciplina.")
    finally:
        conn.close()
        
    return {"id_jogo": id_jogo, "matriz": matriz}

@app.get("/api/disciplinas/{id_professor}")
def get_disciplinas(id_professor: int):
    conn = get_db_connection()
    cur = conn.cursor()
    # Busca apenas disciplinas únicas criadas por esse professor
    cur.execute("SELECT DISTINCT disciplina FROM Caca_Palavras WHERE id_professor = %s;", (id_professor,))
    disciplinas = [row['disciplina'] for row in cur.fetchall()]
    conn.close()
    return disciplinas

@app.get("/api/assuntos/{id_professor}/{disciplina}")
def get_assuntos(id_professor: int, disciplina: str):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT assunto FROM Caca_Palavras WHERE id_professor = %s AND disciplina = %s;", (id_professor, disciplina))
    assuntos = [row['assunto'] for row in cur.fetchall()]
    conn.close()
    return assuntos

@app.get("/api/jogos/professor/{id_professor}")
def get_jogos_professor(id_professor: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id_jogo, disciplina, assunto, dificuldade FROM Caca_Palavras WHERE id_professor = %s ORDER BY id_jogo DESC;", (id_professor,))
    jogos = cur.fetchall()
    conn.close()
    return jogos

@app.delete("/api/jogos/{id_jogo}")
def deletar_jogo(id_jogo: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM Partida_Historico WHERE id_jogo = %s;", (id_jogo,)) # Limpa histórico antes
    cur.execute("DELETE FROM Caca_Palavras WHERE id_jogo = %s;", (id_jogo,))
    conn.commit()
    conn.close()
    return {"status": "sucesso"}

@app.get("/api/jogos/{id_jogo}")
def get_jogo_detalhe(id_jogo: int):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM Caca_Palavras WHERE id_jogo = %s;", (id_jogo,))
    jogo = cur.fetchone()
    conn.close()
    if jogo:
        return jogo
    raise HTTPException(status_code=404, detail="Jogo não encontrado")

@app.put("/api/jogos/{id_jogo}")
def atualizar_jogo(id_jogo: int, jogo: JogoCreate):
    conn = get_db_connection()
    cur = conn.cursor()
    
    palavras = [pr["resposta"] for pr in jogo.perguntas_respostas]
    matriz = gerar_matriz(palavras, jogo.dificuldade)
    
    try:
        cur.execute("""
            UPDATE Caca_Palavras 
            SET disciplina = %s, assunto = %s, dificuldade = %s, perguntas_respostas = %s, matriz_letras = %s
            WHERE id_jogo = %s;
        """, (jogo.disciplina, jogo.assunto, jogo.dificuldade, json.dumps(jogo.perguntas_respostas), json.dumps(matriz), id_jogo))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail="Erro ao atualizar jogo. Verifique os dados.")
    finally:
        conn.close()
        
    return {"id_jogo": id_jogo, "matriz": matriz}