CREATE TYPE perfil_enum AS ENUM ('Professor', 'Aluno');
CREATE TYPE dificuldade_enum AS ENUM ('Fácil', 'Médio', 'Difícil');

CREATE TABLE Usuario (
    id_ludica SERIAL PRIMARY KEY,
    nametag VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    tipo_perfil perfil_enum NOT NULL
);

CREATE TABLE Caca_Palavras (
    id_jogo SERIAL PRIMARY KEY,
    id_professor INT REFERENCES Usuario(id_ludica),
    disciplina VARCHAR(100) NOT NULL,
    assunto VARCHAR(150) NOT NULL,
    dificuldade dificuldade_enum NOT NULL,
    perguntas_respostas JSONB NOT NULL,
    matriz_letras JSONB NOT NULL,
    UNIQUE(disciplina, assunto, dificuldade)
);

CREATE TABLE Partida_Historico (
    id_partida SERIAL PRIMARY KEY,
    id_aluno INT REFERENCES Usuario(id_ludica),
    id_jogo INT REFERENCES Caca_Palavras(id_jogo),
    pontuacao_obtida INT NOT NULL,
    data_conclusao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inserindo usuários fake para a tela inicial
INSERT INTO Usuario (nametag, email, tipo_perfil) VALUES
('Prof. João', 'joao@ludica.com', 'Professor'),
('Aluno Maria', 'maria@ludica.com', 'Aluno');