// 从Netlify Functions获取最近游玩的游戏数据
async function loadRecentGames() {
    // 获取游戏容器
    const recentPlayContainer = document.querySelector('.recent-play');

    try {
        // 尝试从API获取游戏数据
        const response = await fetch('/.netlify/functions/games');

        // 如果API请求成功
        if (response.ok) {
            const games = await response.json();
            renderGames(games, recentPlayContainer);
        } else {
            // 如果API请求失败，回退到localStorage
            fallbackToLocalStorage(recentPlayContainer);
        }
    } catch (error) {
        console.error('获取游戏数据错误:', error);
        // 出错时回退到localStorage
        fallbackToLocalStorage(recentPlayContainer);
    }
}

// 从localStorage获取数据的回退函数
function fallbackToLocalStorage(container) {
    // 获取存储的游戏数据，如果没有则为空数组
    const games = JSON.parse(localStorage.getItem('recentGames')) || [];
    renderGames(games, container);
}

// 渲染游戏列表
function renderGames(games, container) {
    // 清空现有内容，只保留标题
    const title = container.querySelector('h3');
    container.innerHTML = '';
    container.appendChild(title);

    // 如果没有游戏数据，显示占位提示
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

    // 创建游戏列表
    games.forEach(game => {
        // 创建游戏项
        const gameItem = document.createElement('div');
        gameItem.className = 'input-group';
        gameItem.style.position = 'relative';

        // 设置游戏图标
        const iconContainer = document.createElement('div');
        iconContainer.className = 'icon-container';
        iconContainer.innerHTML = `<img src="${game.icon}" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover;">`;

        // 设置游戏名称
        const nameContainer = document.createElement('div');
        nameContainer.style.width = '100%';
        nameContainer.style.padding = '18px 18px 18px 70px';
        nameContainer.style.fontSize = '1.1rem';
        nameContainer.style.color = '#000';
        nameContainer.style.fontWeight = 'bold';
        nameContainer.textContent = game.name;

        // 将元素添加到游戏项中
        gameItem.appendChild(iconContainer);
        gameItem.appendChild(nameContainer);

        // 将游戏项添加到容器中
        container.appendChild(gameItem);
    });
}

// 页面加载时初始化游戏列表
document.addEventListener('DOMContentLoaded', function () {
    loadRecentGames();
});