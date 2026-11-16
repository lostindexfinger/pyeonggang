// 매일성경전집 1 - 모세오경 (창세기, 출애굽기, 레위기, 민수기, 신명기) 통합 데이터
(function () {
  const books = [
    { id: "창세기", name: "창세기", desc: "창조, 타락, 언약과 족장들의 이야기", items: window.QT_GENESIS || [] },
    { id: "출애굽기", name: "출애굽기", desc: "구원, 시내산 언약과 성막 이야기", items: window.QT_EXODUS || [] },
    { id: "레위기", name: "레위기", desc: "하나님 앞에서의 성결과 이웃 사랑", items: window.QT_LEVITICUS || [] },
    { id: "민수기", name: "민수기", desc: "광야 40년 여정과 하나님의 신실하심", items: window.QT_NUMBERS || [] },
    { id: "신명기", name: "신명기", desc: "가나안 입성 전 모세의 고별 설교와 언약 갱신", items: window.QT_DEUTERONOMY || [] }
  ];

  window.QT_BOOKS = books;
  window.QT_PASSAGES = books.flatMap((b) => b.items);
})();
