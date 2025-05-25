// 从localStorage获取最近游玩的游戏数据
function loadRecentGames() {
    // 获取存储的游戏数据，如果没有则使用默认数据
    const games = JSON.parse(localStorage.getItem('recentGames')) || [
        {
            id: 1,
            name: "Ghost Of Tsushima Legend Mode",
            icon: "https://img.122200.xyz/GhostOfTsushima.ico"
        },
        {
            id: 2,
            name: "Rise of the Rōnin",
            icon: "https://img.122200.xyz/RiseoftheRonin.png"
        }
    ];

    // 获取最近游玩区域的容器
    const recentPlayContainer = document.querySelector('.recent-play');
    
    // 清空现有内容，只保留标题
    const title = recentPlayContainer.querySelector('h3');
    recentPlayContainer.innerHTML = '';
    recentPlayContainer.appendChild(title);
    
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
        recentPlayContainer.appendChild(gameItem);
    });
}

// 页面加载时初始化游戏列表
document.addEventListener('DOMContentLoaded', function() {
    loadRecentGames();
});