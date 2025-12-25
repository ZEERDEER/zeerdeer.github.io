// 从Netlify Functions获取最近游玩的游戏数据
async function loadRecentGames() {
    const recentPlayContainer = document.querySelector('.recent-play');

    try {
        // 使用时间戳防止浏览器缓存
        const response = await fetch(`/.netlify/functions/games?t=${Date.now()}`);

        if (response.ok) {
            const data = await response.json();
            console.log(`[GameData] Status: ${data.storeStatus}, ServerTime: ${data.serverTime}`);

            // 提取游戏列表
            const games = data.games || [];
            renderGames(games, recentPlayContainer);
        } else {
            console.error('API 请求失败，状态码:', response.status);
            renderGames([], recentPlayContainer);
        }
    } catch (error) {
        console.error('获取游戏数据发生网络错误:', error);
        renderGames([], recentPlayContainer);
    }
}

// 渲染游戏列表
function renderGames(games, container) {
    const title = container.querySelector('h3');
    container.innerHTML = '';
    container.appendChild(title);

    if (!games || games.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'input-group';
        emptyState.style.padding = '20px';
        emptyState.style.textAlign = 'center';
        emptyState.style.color = '#777';
        emptyState.style.fontSize = '0.9rem';
        emptyState.textContent = '最近暂无游玩记录';
        container.appendChild(emptyState);
        return;
    }

    games.forEach(game => {
        const gameItem = document.createElement('div');
        gameItem.className = 'input-group';
        gameItem.style.position = 'relative';

        const iconContainer = document.createElement('div');
        iconContainer.className = 'icon-container';
        iconContainer.innerHTML = `<img src="${game.icon}" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover;">`;

        const nameContainer = document.createElement('div');
        nameContainer.style.width = '100%';
        nameContainer.style.padding = '18px 18px 18px 70px';
        nameContainer.style.fontSize = '1.1rem';
        nameContainer.style.color = '#000';
        nameContainer.style.fontWeight = 'bold';
        nameContainer.textContent = game.name;

        gameItem.appendChild(iconContainer);
        gameItem.appendChild(nameContainer);
        container.appendChild(gameItem);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadRecentGames();
});