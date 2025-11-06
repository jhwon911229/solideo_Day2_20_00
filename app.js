// 전역 변수
let map;
let directionsService;
let directionsRenderer;
let placesService;
let geocoder;
let currentRoute = null;
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

// Google Maps 초기화
function initMap() {
    // 맵 초기화 (서울 중심)
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 37.5665, lng: 126.9780 },
        zoom: 12,
        mapTypeControl: true,
        fullscreenControl: true,
        streetViewControl: false
    });

    // 서비스 초기화
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: false
    });
    placesService = new google.maps.places.PlacesService(map);
    geocoder = new google.maps.Geocoder();

    // 이벤트 리스너 설정
    setupEventListeners();

    // 차트 초기화
    initCharts();

    console.log('TripSync 앱이 초기화되었습니다.');
}

// 이벤트 리스너 설정
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

// 탭 전환
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

    // 요약 탭이면 업데이트
    if (tabId === 'summary') {
        updateSummary();
    }
}

// 경로 검색
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
        // 경로 계산
        const request = {
            origin: departure,
            destination: destination,
            travelMode: google.maps.TravelMode[transportMode],
            provideRouteAlternatives: true
        };

        directionsService.route(request, (result, status) => {
            if (status === 'OK') {
                // 경로 표시
                directionsRenderer.setDirections(result);

                // 경로 정보 저장
                const route = result.routes[0];
                const leg = route.legs[0];
                appData.route = {
                    distance: leg.distance.text,
                    duration: leg.duration.text,
                    distanceValue: leg.distance.value,
                    durationValue: leg.duration.value
                };

                // 경로 정보 표시
                displayRouteInfo(appData.route);

                // 주변 장소 검색
                searchNearbyPlaces(leg.end_location);

                showNotification('경로를 찾았습니다!', 'success');
            } else {
                showNotification('경로를 찾을 수 없습니다. 주소를 확인해주세요.', 'error');
            }

            // 버튼 복원
            searchBtn.innerHTML = originalText;
            searchBtn.disabled = false;
        });
    } catch (error) {
        console.error('경로 검색 오류:', error);
        showNotification('오류가 발생했습니다.', 'error');
        searchBtn.innerHTML = originalText;
        searchBtn.disabled = false;
    }
}

// 경로 정보 표시
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
}

// 주변 장소 검색
function searchNearbyPlaces(location) {
    nearbyPlaces = [];

    const searchTypes = [
        { type: 'tourist_attraction', category: 'tourist' },
        { type: 'restaurant', category: 'restaurant' },
        { type: 'lodging', category: 'accommodation' }
    ];

    let completedSearches = 0;

    searchTypes.forEach(searchType => {
        const request = {
            location: location,
            radius: 5000, // 5km 반경
            type: searchType.type
        };

        placesService.nearbySearch(request, (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK) {
                results.slice(0, 5).forEach(place => {
                    nearbyPlaces.push({
                        name: place.name,
                        category: searchType.category,
                        rating: place.rating || 0,
                        address: place.vicinity,
                        location: place.geometry.location,
                        photo: place.photos ? place.photos[0].getUrl({ maxWidth: 400 }) : null
                    });
                });
            }

            completedSearches++;
            if (completedSearches === searchTypes.length) {
                displayRecommendations();
            }
        });
    });
}

// 추천 장소 표시
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
                    <p>해당 카테고리의 추천 장소가 없습니다.</p>
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
            </div>
        `;

        card.addEventListener('click', () => {
            map.setCenter(place.location);
            map.setZoom(15);
            new google.maps.Marker({
                position: place.location,
                map: map,
                title: place.name,
                animation: google.maps.Animation.BOUNCE
            });
            setTimeout(() => switchTab('planner'), 100);
        });

        container.appendChild(card);
    });

    appData.recommendations = filteredPlaces;
}

// 추천 필터링
function filterRecommendations(filter) {
    displayRecommendations(filter);
}

// 예산 분배 업데이트
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

// 차트 초기화
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

// 예산 차트 업데이트
function updateBudgetChart(transport, accommodation, food, activity) {
    if (budgetChartInstance) {
        budgetChartInstance.data.datasets[0].data = [transport, accommodation, food, activity];
        budgetChartInstance.update();
    }
}

// 비교 차트 업데이트
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

// 일정 요약 업데이트
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

// 알림 표시
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

// 페이지 로드 시
window.addEventListener('load', () => {
    console.log('TripSync 앱 로딩 완료');

    // 오늘 날짜를 기본값으로 설정
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('departure-date').value = now.toISOString().slice(0, 16);
});
