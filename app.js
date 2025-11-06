// 전역 변수
let map;
let routingControl = null;
let markers = [];
let nearbyPlaces = [];
let budgetChartInstance = null;
let comparisonChartInstance = null;

// 앱 데이터
const appData = {
    departure: '',
    destination: '',
    departureDate: '',
    duration: 3,
    budget: 0,
    transportMode: 'DRIVING',
    route: null,
    recommendations: [],
    budgetBreakdown: {
        transport: 30,
        accommodation: 40,
        food: 20,
        activity: 10
    }
};

// ==================== 지도 초기화 ====================

function initMap() {
    try {
        console.log('Leaflet 지도 초기화 시작...');

        // Leaflet 맵 생성 (서울 중심)
        map = L.map('map').setView([37.5665, 126.9780], 12);

        // OpenStreetMap 타일 레이어 추가
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);

        console.log('✓ Leaflet 지도가 성공적으로 로드되었습니다.');
        showNotification('지도가 준비되었습니다!', 'success');

    } catch (error) {
        console.error('Leaflet 초기화 오류:', error);
        showNotification('지도 로드에 실패했습니다.', 'error');
    }
}

// ==================== 이벤트 리스너 ====================

function setupEventListeners() {
    // 탭 전환
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            switchTab(tabId);
        });
    });

    // 경로 검색
    document.getElementById('search-route').addEventListener('click', searchRoute);

    // 예산 슬라이더
    const sliders = ['transport', 'accommodation', 'food', 'activity'];
    sliders.forEach(type => {
        const slider = document.getElementById(`${type}-slider`);
        if (slider) {
            slider.addEventListener('input', () => updateBudgetBreakdown());
        }
    });

    // 추천 필터
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filter = btn.dataset.filter;
            filterRecommendations(filter);
        });
    });

    // 예산 입력 변경
    document.getElementById('budget').addEventListener('input', updateBudgetBreakdown);
}

// ==================== 탭 전환 ====================

function switchTab(tabId) {
    // 탭 버튼 활성화
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabId) {
            btn.classList.add('active');
        }
    });

    // 탭 콘텐츠 표시
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabId).classList.add('active');

    // Leaflet 지도 크기 조정
    if (tabId === 'planner' && map) {
        setTimeout(() => map.invalidateSize(), 100);
    }

    // 요약 탭이면 업데이트
    if (tabId === 'summary') {
        updateSummary();
    }
}

// ==================== 경로 검색 ====================

async function searchRoute() {
    const departure = document.getElementById('departure').value;
    const destination = document.getElementById('destination').value;
    const departureDate = document.getElementById('departure-date').value;
    const duration = parseInt(document.getElementById('duration').value);
    const budget = parseInt(document.getElementById('budget').value);
    const transportMode = document.getElementById('transport-mode').value;

    // 유효성 검사
    if (!departure || !destination) {
        showNotification('출발지와 목적지를 입력해주세요.', 'error');
        return;
    }

    if (!budget || budget <= 0) {
        showNotification('예산을 입력해주세요.', 'error');
        return;
    }

    // 데이터 저장
    appData.departure = departure;
    appData.destination = destination;
    appData.departureDate = departureDate;
    appData.duration = duration;
    appData.budget = budget;
    appData.transportMode = transportMode;

    // 로딩 표시
    const searchBtn = document.getElementById('search-route');
    const originalText = searchBtn.innerHTML;
    searchBtn.innerHTML = '<span class="loading"></span> 검색 중...';
    searchBtn.disabled = true;

    try {
        // 기존 경로 제거
        if (routingControl) {
            map.removeControl(routingControl);
        }

        // 기존 마커 제거
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];

        // Nominatim을 사용하여 주소를 좌표로 변환
        const depCoords = await geocodeAddress(departure);
        const destCoords = await geocodeAddress(destination);

        // 경로 찾기
        routingControl = L.Routing.control({
            waypoints: [
                L.latLng(depCoords.lat, depCoords.lon),
                L.latLng(destCoords.lat, destCoords.lon)
            ],
            routeWhileDragging: false,
            lineOptions: {
                styles: [{ color: '#2563eb', weight: 5, opacity: 0.8 }]
            },
            createMarker: function(i, waypoint, n) {
                const marker = L.marker(waypoint.latLng, {
                    draggable: false,
                    icon: L.divIcon({
                        className: 'custom-marker',
                        html: `<div style="background: ${i === 0 ? '#10b981' : '#ef4444'}; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">${i === 0 ? 'A' : 'B'}</div>`,
                        iconSize: [30, 30],
                        iconAnchor: [15, 15]
                    })
                });
                markers.push(marker);
                return marker;
            }
        }).addTo(map);

        // 경로 정보 이벤트
        routingControl.on('routesfound', function(e) {
            const route = e.routes[0];
            const distance = (route.summary.totalDistance / 1000).toFixed(1);
            const duration = Math.round(route.summary.totalTime / 60);

            appData.route = {
                distance: `${distance} km`,
                duration: `${duration}분`,
                distanceValue: route.summary.totalDistance,
                durationValue: route.summary.totalTime,
                instructions: route.instructions
            };

            displayRouteInfo(appData.route);

            // 내비게이션 안내 표시
            displayNavigation(route.instructions);

            // 목적지 주변 추천 장소 생성
            generateRecommendations(destCoords);

            showNotification('경로를 찾았습니다!', 'success');
        });

    } catch (error) {
        console.error('경로 검색 오류:', error);
        showNotification('경로를 찾을 수 없습니다. 주소를 확인해주세요.', 'error');
    } finally {
        // 버튼 복원
        searchBtn.innerHTML = originalText;
        searchBtn.disabled = false;
    }
}

// Nominatim으로 주소를 좌표로 변환
async function geocodeAddress(address) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=kr`;

    const response = await fetch(url, {
        headers: {
            'User-Agent': 'TripSync Travel Planner'
        }
    });
    const data = await response.json();

    if (data.length === 0) {
        throw new Error('주소를 찾을 수 없습니다');
    }

    return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
    };
}

// ==================== 경로 정보 표시 ====================

function displayRouteInfo(route) {
    document.getElementById('route-info').style.display = 'block';
    document.getElementById('distance').textContent = route.distance;
    document.getElementById('duration-display').textContent = route.duration;

    // 교통비 추정 (간단한 계산)
    let estimatedCost = 0;
    const distanceKm = route.distanceValue / 1000;

    switch (appData.transportMode) {
        case 'DRIVING':
            estimatedCost = Math.round(distanceKm * 150); // km당 150원 (유류비)
            break;
        case 'TRANSIT':
            estimatedCost = Math.round(distanceKm * 100); // km당 100원 (대중교통)
            break;
        case 'WALKING':
            estimatedCost = 0;
            break;
    }

    document.getElementById('estimated-cost').textContent = estimatedCost.toLocaleString() + '원';

    // 교통비 결제 버튼 표시
    const payButton = document.getElementById('pay-transport');
    if (estimatedCost > 0) {
        payButton.style.display = 'block';
        payButton.onclick = () => initiatePayment('교통비', estimatedCost, 'transport');
    } else {
        payButton.style.display = 'none';
    }
}

// ==================== 내비게이션 안내 표시 ====================

function displayNavigation(instructions) {
    const navPanel = document.getElementById('navigation-panel');
    const navSteps = document.getElementById('navigation-steps');

    navPanel.style.display = 'block';
    navSteps.innerHTML = '';

    if (!instructions || instructions.length === 0) {
        navSteps.innerHTML = '<p style="text-align: center; opacity: 0.8;">경로 안내 정보가 없습니다.</p>';
        return;
    }

    instructions.forEach((instruction, index) => {
        const step = document.createElement('div');
        step.className = 'nav-step';

        // 방향 아이콘 결정
        let icon = 'fa-arrow-up';
        const type = instruction.type || '';

        if (type.includes('right')) icon = 'fa-arrow-right';
        else if (type.includes('left')) icon = 'fa-arrow-left';
        else if (type.includes('straight')) icon = 'fa-arrow-up';
        else if (type === 'WaypointReached') icon = 'fa-flag-checkered';
        else if (index === 0) icon = 'fa-play';
        else if (index === instructions.length - 1) icon = 'fa-flag-checkered';

        const distance = instruction.distance ? (instruction.distance / 1000).toFixed(1) + ' km' : '';
        const text = instruction.text || `${index + 1}번째 구간`;

        step.innerHTML = `
            <div class="nav-step-icon">
                <i class="fas ${icon}"></i>
            </div>
            <div class="nav-step-content">
                <div class="nav-step-instruction">${text}</div>
                ${distance ? `<div class="nav-step-distance"><i class="fas fa-location-arrow"></i> ${distance}</div>` : ''}
            </div>
        `;

        navSteps.appendChild(step);
    });
}

// ==================== 추천 장소 생성 ====================

function generateRecommendations(destCoords) {
    // 목적지 주변 추천 장소 생성 (가격 정보 포함)
    nearbyPlaces = [
        {
            name: '목적지 주변 관광 명소',
            category: 'tourist',
            rating: 4.5,
            address: `위도 ${destCoords.lat.toFixed(4)}, 경도 ${destCoords.lon.toFixed(4)} 주변`,
            location: { lat: destCoords.lat, lng: destCoords.lon },
            photo: null,
            price: 15000,
            priceLabel: '입장료'
        },
        {
            name: '추천 맛집 - 한식당',
            category: 'restaurant',
            rating: 4.3,
            address: '목적지에서 100m 거리',
            location: { lat: destCoords.lat + 0.001, lng: destCoords.lon + 0.001 },
            photo: null,
            price: 25000,
            priceLabel: '인당 평균'
        },
        {
            name: '근처 카페 - 스페셜티 커피',
            category: 'restaurant',
            rating: 4.6,
            address: '목적지에서 150m 거리',
            location: { lat: destCoords.lat - 0.0008, lng: destCoords.lon + 0.0012 },
            photo: null,
            price: 8000,
            priceLabel: '인당 평균'
        },
        {
            name: '프리미엄 숙박 시설',
            category: 'accommodation',
            rating: 4.7,
            address: '목적지에서 200m 거리',
            location: { lat: destCoords.lat - 0.001, lng: destCoords.lon - 0.001 },
            photo: null,
            price: 120000,
            priceLabel: '1박 기준'
        },
        {
            name: '비즈니스 호텔',
            category: 'accommodation',
            rating: 4.4,
            address: '목적지에서 300m 거리',
            location: { lat: destCoords.lat + 0.0015, lng: destCoords.lon - 0.0008 },
            photo: null,
            price: 85000,
            priceLabel: '1박 기준'
        },
        {
            name: '관광 안내소 & 투어',
            category: 'tourist',
            rating: 4.2,
            address: '목적지에서 250m 거리',
            location: { lat: destCoords.lat - 0.0012, lng: destCoords.lon + 0.0015 },
            photo: null,
            price: 35000,
            priceLabel: '투어 비용'
        }
    ];

    displayRecommendations();
    appData.recommendations = nearbyPlaces;
}

// ==================== 추천 장소 표시 ====================

function displayRecommendations(filter = 'all') {
    const container = document.getElementById('recommendations-list');
    container.innerHTML = '';

    let filteredPlaces = nearbyPlaces;
    if (filter !== 'all') {
        filteredPlaces = nearbyPlaces.filter(place => place.category === filter);
    }

    if (filteredPlaces.length === 0) {
        container.innerHTML = `
            <div class="recommendation-card">
                <div class="card-image">
                    <i class="fas fa-search"></i>
                </div>
                <div class="card-content">
                    <h3>검색 결과 없음</h3>
                    <p>경로를 검색하면 추천 장소를 제공합니다.</p>
                </div>
            </div>
        `;
        return;
    }

    filteredPlaces.forEach(place => {
        const card = document.createElement('div');
        card.className = 'recommendation-card';

        const categoryIcon = {
            'tourist': 'fa-landmark',
            'restaurant': 'fa-utensils',
            'accommodation': 'fa-hotel'
        };

        const icon = categoryIcon[place.category] || 'fa-map-marker-alt';

        card.innerHTML = `
            <div class="card-image" style="${place.photo ? `background: url('${place.photo}') center/cover;` : ''}">
                ${!place.photo ? `<i class="fas ${icon}"></i>` : ''}
            </div>
            <div class="card-content">
                <h3>${place.name}</h3>
                <p>${place.address}</p>
                <div class="card-rating">
                    <i class="fas fa-star"></i>
                    <span>${place.rating.toFixed(1)}</span>
                </div>
                ${place.price ? `
                    <div class="card-price">
                        <span class="card-price-label">${place.priceLabel}:</span>
                        ${place.price.toLocaleString()}원
                    </div>
                ` : ''}
                <div class="card-actions">
                    <button class="btn-view" data-place-name="${place.name}">
                        <i class="fas fa-map-marker-alt"></i> 위치 보기
                    </button>
                    ${place.price ? `
                        <button class="btn-book" data-place-id="${filteredPlaces.indexOf(place)}">
                            <i class="fas fa-credit-card"></i> 예약/결제
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        // 위치 보기 버튼
        const viewBtn = card.querySelector('.btn-view');
        viewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (place.location) {
                map.setView([place.location.lat, place.location.lng], 16);
                const marker = L.marker([place.location.lat, place.location.lng], {
                    icon: L.divIcon({
                        className: 'place-marker',
                        html: `<div style="background: #f59e0b; color: white; padding: 8px 12px; border-radius: 20px; font-weight: bold; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">${place.name}</div>`,
                        iconSize: [100, 40],
                        iconAnchor: [50, 20]
                    })
                }).addTo(map);

                marker.bindPopup(`<b>${place.name}</b><br>${place.address}<br>⭐ ${place.rating}<br>💰 ${place.price.toLocaleString()}원`).openPopup();
                markers.push(marker);
            }
            setTimeout(() => switchTab('planner'), 100);
        });

        // 결제 버튼
        const bookBtn = card.querySelector('.btn-book');
        if (bookBtn) {
            bookBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                initiatePayment(place.name, place.price, place.category);
            });
        }

        container.appendChild(card);
    });

    appData.recommendations = filteredPlaces;
}

function filterRecommendations(filter) {
    displayRecommendations(filter);
}

// ==================== 예산 관리 ====================

function updateBudgetBreakdown() {
    const budget = parseInt(document.getElementById('budget').value) || 0;

    if (budget === 0) {
        document.getElementById('total-budget').textContent = '0원';
        document.getElementById('estimated-spending').textContent = '0원';
        document.getElementById('remaining-budget').textContent = '0원';
        return;
    }

    appData.budget = budget;

    // 슬라이더 값 가져오기
    const transport = parseInt(document.getElementById('transport-slider').value);
    const accommodation = parseInt(document.getElementById('accommodation-slider').value);
    const food = parseInt(document.getElementById('food-slider').value);
    const activity = parseInt(document.getElementById('activity-slider').value);

    // 총합 계산
    const total = transport + accommodation + food + activity;

    // 비율 계산
    const transportCost = Math.round(budget * (transport / total));
    const accommodationCost = Math.round(budget * (accommodation / total));
    const foodCost = Math.round(budget * (food / total));
    const activityCost = Math.round(budget * (activity / total));

    // 표시
    document.getElementById('transport-cost').textContent = transportCost.toLocaleString() + '원';
    document.getElementById('accommodation-cost').textContent = accommodationCost.toLocaleString() + '원';
    document.getElementById('food-cost').textContent = foodCost.toLocaleString() + '원';
    document.getElementById('activity-cost').textContent = activityCost.toLocaleString() + '원';

    // 예산 카드 업데이트
    const estimatedSpending = transportCost + accommodationCost + foodCost + activityCost;
    document.getElementById('total-budget').textContent = budget.toLocaleString() + '원';
    document.getElementById('estimated-spending').textContent = estimatedSpending.toLocaleString() + '원';
    document.getElementById('remaining-budget').textContent = (budget - estimatedSpending).toLocaleString() + '원';

    // 차트 업데이트
    updateBudgetChart(transportCost, accommodationCost, foodCost, activityCost);

    // 데이터 저장
    appData.budgetBreakdown = {
        transport: transportCost,
        accommodation: accommodationCost,
        food: foodCost,
        activity: activityCost
    };
}

// ==================== 차트 ====================

function initCharts() {
    // 예산 차트
    const budgetCtx = document.getElementById('budget-chart');
    if (budgetCtx) {
        budgetChartInstance = new Chart(budgetCtx, {
            type: 'doughnut',
            data: {
                labels: ['교통비', '숙박비', '식비', '관광/활동'],
                datasets: [{
                    data: [0, 0, 0, 0],
                    backgroundColor: [
                        '#2563eb',
                        '#06b6d4',
                        '#10b981',
                        '#f59e0b'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    // 비교 차트
    const comparisonCtx = document.getElementById('comparison-chart');
    if (comparisonCtx) {
        comparisonChartInstance = new Chart(comparisonCtx, {
            type: 'bar',
            data: {
                labels: ['현재 경로'],
                datasets: [
                    {
                        label: '거리 (km)',
                        data: [0],
                        backgroundColor: '#2563eb'
                    },
                    {
                        label: '시간 (분)',
                        data: [0],
                        backgroundColor: '#06b6d4'
                    },
                    {
                        label: '비용 (천원)',
                        data: [0],
                        backgroundColor: '#10b981'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

function updateBudgetChart(transport, accommodation, food, activity) {
    if (budgetChartInstance) {
        budgetChartInstance.data.datasets[0].data = [transport, accommodation, food, activity];
        budgetChartInstance.update();
    }
}

function updateComparisonChart() {
    if (comparisonChartInstance && appData.route) {
        const distanceKm = Math.round(appData.route.distanceValue / 1000);
        const durationMin = Math.round(appData.route.durationValue / 60);
        const costThousand = Math.round(appData.budgetBreakdown.transport / 1000);

        comparisonChartInstance.data.datasets[0].data = [distanceKm];
        comparisonChartInstance.data.datasets[1].data = [durationMin];
        comparisonChartInstance.data.datasets[2].data = [costThousand];
        comparisonChartInstance.update();
    }
}

// ==================== 일정 요약 ====================

function updateSummary() {
    // 경로 정보
    if (appData.route) {
        document.getElementById('summary-route').innerHTML = `
            <div class="summary-item">
                <span>출발:</span>
                <span>${appData.departure}</span>
            </div>
            <div class="summary-item">
                <span>도착:</span>
                <span>${appData.destination}</span>
            </div>
            <div class="summary-item">
                <span>거리:</span>
                <span>${appData.route.distance}</span>
            </div>
        `;
    }

    // 시간 정보
    document.getElementById('summary-duration').textContent = `${appData.duration}일`;
    if (appData.route) {
        document.getElementById('summary-travel-time').textContent = appData.route.duration;
    }

    // 비용 정보
    document.getElementById('summary-total-budget').textContent = appData.budget.toLocaleString() + '원';
    const totalSpending = Object.values(appData.budgetBreakdown).reduce((a, b) => a + b, 0);
    document.getElementById('summary-estimated').textContent = totalSpending.toLocaleString() + '원';

    // 추천 장소
    if (appData.recommendations.length > 0) {
        let placesHtml = '<ul style="list-style: none; padding: 0;">';
        appData.recommendations.slice(0, 5).forEach(place => {
            placesHtml += `
                <li style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                    <strong>${place.name}</strong><br>
                    <small style="color: #6b7280;">${place.address}</small>
                </li>
            `;
        });
        placesHtml += '</ul>';
        document.getElementById('summary-places').innerHTML = placesHtml;
    }

    // 비교 차트 업데이트
    updateComparisonChart();
}

// ==================== 알림 ====================

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <strong>${type === 'success' ? '✓' : '✗'}</strong> ${message}
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ==================== 결제 시스템 ====================

// 토스페이먼츠 클라이언트 키 (테스트용)
const TOSS_CLIENT_KEY = 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq';

function initiatePayment(itemName, amount, category) {
    // 간단한 결제 확인 모달 (실제 프로젝트에서는 토스페이먼츠 위젯 사용)
    const confirmPayment = confirm(
        `${itemName}\n` +
        `결제 금액: ${amount.toLocaleString()}원\n\n` +
        `결제를 진행하시겠습니까?`
    );

    if (!confirmPayment) {
        return;
    }

    // 결제 처리 시뮬레이션
    showNotification('결제 처리 중...', 'success');

    // 실제 토스페이먼츠 결제 로직 (예시)
    setTimeout(() => {
        const success = Math.random() > 0.1; // 90% 성공률

        if (success) {
            showNotification(`${itemName} 결제가 완료되었습니다! 💳`, 'success');

            // 결제 내역 저장
            const payment = {
                itemName: itemName,
                amount: amount,
                category: category,
                timestamp: new Date().toISOString(),
                status: 'completed'
            };

            // 로컬 스토리지에 결제 내역 저장
            const payments = JSON.parse(localStorage.getItem('tripsync_payments') || '[]');
            payments.push(payment);
            localStorage.setItem('tripsync_payments', JSON.stringify(payments));

            // 예산에서 차감
            updateBudgetAfterPayment(amount);
        } else {
            showNotification('결제에 실패했습니다. 다시 시도해주세요.', 'error');
        }
    }, 1500);
}

function updateBudgetAfterPayment(amount) {
    // 현재 예산에서 결제 금액 차감
    const currentBudget = parseInt(document.getElementById('budget').value) || 0;
    const remainingBudget = currentBudget - amount;

    if (remainingBudget < 0) {
        showNotification('⚠️ 예산을 초과했습니다!', 'warning');
    }

    // UI 업데이트
    updateBudgetBreakdown();
}

// 실제 토스페이먼츠 연동 함수 (프로덕션용)
async function processRealPayment(itemName, amount) {
    try {
        // 토스페이먼츠 결제위젯 초기화
        const paymentWidget = PaymentWidget(TOSS_CLIENT_KEY, PaymentWidget.ANONYMOUS);

        // 결제 정보 설정
        const paymentMethodWidget = paymentWidget.renderPaymentMethods(
            '#payment-method',
            { value: amount },
            { variantKey: 'DEFAULT' }
        );

        // 이용약관 UI 렌더링
        paymentWidget.renderAgreement('#agreement', { variantKey: 'AGREEMENT' });

        // 결제 요청
        await paymentWidget.requestPayment({
            orderId: generateOrderId(),
            orderName: itemName,
            successUrl: window.location.origin + '/payment/success',
            failUrl: window.location.origin + '/payment/fail',
            customerEmail: 'customer@example.com',
            customerName: '고객명',
        });
    } catch (error) {
        console.error('결제 오류:', error);
        showNotification('결제 처리 중 오류가 발생했습니다.', 'error');
    }
}

function generateOrderId() {
    return 'ORDER_' + new Date().getTime() + '_' + Math.random().toString(36).substr(2, 9);
}

// ==================== 페이지 로드 ====================

window.addEventListener('load', () => {
    console.log('TripSync 앱 로딩 완료');

    // 지도 초기화
    initMap();

    // 이벤트 리스너 설정
    setupEventListeners();

    // 차트 초기화
    initCharts();

    // 오늘 날짜를 기본값으로 설정
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('departure-date').value = now.toISOString().slice(0, 16);
});
