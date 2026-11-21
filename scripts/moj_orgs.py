"""G空間情報センター（www.geospatial.jp の CKAN）で、法務省の「登記所備付地図データ」（地図XML。市区町村ごとの zip）を
置いている組織の名前（都道府県コード → 組織）。地番の筆のタイル（scripts/parcel-tiles/build_pref.py）と、公図の推定
（scripts/kozu-tiles/kozu.py）が、この組織の zip を CKAN の package_search で探す。

    sys.path.insert(0, <scripts のフォルダー>)
    from moj_orgs import ORGS

47都道府県の全部が CKAN の organization_list にあることを確かめた（2026-11-21）。年ごとの写しの組織
（moj-01hokkaido-2024-2025 など）は使わない。参考図の仕組み（scripts/sanko/build.py の MOJ_ORGS）にも同じ表がある。
"""

ORGS = {
    "01": "moj-01hokkaido", "02": "moj-02aomori", "03": "moj-03iwate", "04": "moj-04miyagi", "05": "moj-05akita", "06": "moj-06yamagata",
    "07": "moj-07fukushima", "08": "moj-08ibaraki", "09": "moj-09tochigi", "10": "moj-10gunma", "11": "moj-11saitama", "12": "moj-12chiba",
    "13": "moj-13tokyo", "14": "moj-14kanagawa", "15": "moj-15niigata", "16": "moj-16toyama", "17": "moj-17ishikawa", "18": "moj-18fukui",
    "19": "moj-19yamanashi", "20": "moj-20nagano", "21": "moj-21gifu", "22": "moj-22shizuoka", "23": "moj-23aichi", "24": "moj-24mie",
    "25": "moj-25shiga", "26": "moj-26kyoto", "27": "moj-27osaka", "28": "moj-28hyogo", "29": "moj-29nara", "30": "moj-30wakayama",
    "31": "moj-31tottori", "32": "moj-32shimane", "33": "moj-33okayama", "34": "moj-34hiroshima", "35": "moj-35yamaguchi", "36": "moj-36tokushima",
    "37": "moj-37kagawa", "38": "moj-38ehime", "39": "moj-39kochi", "40": "moj-40fukuoka", "41": "moj-41saga", "42": "moj-42nagasaki",
    "43": "moj-43kumamoto", "44": "moj-44oita", "45": "moj-45miyazaki", "46": "moj-46kagoshima", "47": "moj-47okinawa",
}  # fmt: skip
