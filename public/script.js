
document.addEventListener("DOMContentLoaded", () => {
    const playerForm = document.getElementById("addPlayerForm");
    const playerNameInput = document.getElementById("playerName");
    const playersContainer = document.getElementById("players");

    async function pingServer() {
        try {
            await fetch(`${API_URL}/ping`);
            console.log("Servidor ativo");
        } catch (error) {
            console.error("Erro ao pingar o servidor:", error);
        }
    }

    playerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const playerName = playerNameInput.value.trim();
        if (playerName) {
            await addPlayer(playerName);
            playerNameInput.value = '';
            renderPlayers();
        }
    });

    async function fetchPlayers() {
        const response = await fetch(`${API_URL}/players`);
        const players = await response.json();
        return players;
    }

    async function addPlayer(name) {
        await fetch(`${API_URL}/players`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, lives: 3 })
        });
    }

    async function updatePlayer(id, lives) {
        await fetch(`${API_URL}/players/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ lives })
        });
    }

    async function deletePlayer(id) {
        await fetch(`${API_URL}/players/${id}`, {
            method: 'DELETE'
        });
    }

    async function renderPlayers() {
        const players = await fetchPlayers();
        playersContainer.innerHTML = "";

        players.forEach(player => {
            const playerElement = document.createElement("div");
            playerElement.className = "player";
            playerElement.innerHTML = `
                <span>${player.name}</span>
                <span>Vidas: ${player.lives}</span>
                <button onclick="changeLives(${player.id}, ${player.lives - 1})">-1 Vida</button>
                <button onclick="changeLives(${player.id}, ${player.lives + 1})">+1 Vida</button>
                <button onclick="removePlayer(${player.id})">Remover</button>
            `;
            playersContainer.appendChild(playerElement);
        });
    }

    window.changeLives = async (id, lives) => {
        await updatePlayer(id, lives);
        renderPlayers();
    }

    window.removePlayer = async (id) => {
        await deletePlayer(id);
        renderPlayers();
    }

    pingServer();
    renderPlayers();
});
