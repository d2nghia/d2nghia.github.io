/**
 * Every word on these pages, in Vietnamese and English.
 *
 * Vietnamese is what the pages open in: the children they are for read
 * Vietnamese, and a child who has to decode the instructions before decoding
 * the cube has been given two puzzles. English is kept beside it so the wording
 * can be compared and checked.
 *
 * Static text is marked in the HTML with data-t="key"; everything else asks for
 * a key through t().
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CubeLang = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VI = {
    'lang.other': 'English',

    'colour.white': 'trắng', 'colour.yellow': 'vàng', 'colour.green': 'xanh lá',
    'colour.blue': 'xanh dương', 'colour.red': 'đỏ', 'colour.orange': 'cam',
    'side.U': 'trên', 'side.D': 'dưới', 'side.F': 'trước',
    'side.R': 'phải', 'side.L': 'trái', 'side.B': 'sau',

    'start.title': 'Học giải Rubik',
    'start.lede': 'Đưa khối Rubik của bạn cho máy ảnh xem, rồi mình sẽ chỉ từng nước xoay một, cho tới khi khối Rubik xong xuôi. Không phải học ký hiệu gì cả.',
    'start.step1': 'Cho máy ảnh xem đủ sáu mặt.',
    'start.step2': 'Xem lại màu mình đọc được — chạm vào ô nào mình đọc sai.',
    'start.step3': 'Làm theo từng nước xoay. Mỗi lần một nước thôi.',
    'start.camera': 'Cho máy ảnh xem 📷',
    'start.steps': 'Chỉ cần xem các bước 📖',
    'start.demo': 'Thử một khối mẫu 🎲',
    'start.manual': 'Không có máy ảnh? Tự tô màu vào',
    'start.privacy': 'Dùng ở chỗ đủ sáng là tốt nhất. Hình từ máy ảnh không rời khỏi trang này — không có gì được gửi đi đâu cả.',

    'cap.tool': 'Tự tô màu bằng máy ảnh',
    'cap.solve': 'Giải thôi ▶',
    'cap.clear': 'Xóa tất cả màu',
    'cap.kept.all': 'Đây là khối Rubik bạn đọc lần trước. Bấm Giải thôi, hoặc đọc lại một mặt nếu muốn sửa.',
    'cap.kept.some': 'Còn giữ {n} mặt từ lần trước.',
    'cap.missing': 'Tô màu vào các ô xám trên mặt này nhé.',

    'cam.title': 'Đưa mặt đang sáng lên cho máy ảnh xem',
    'cam.title.trouble': 'Chỗ này không có máy ảnh',
    'cam.accept': 'Nhận ✓',
    'cam.cancel': 'Thoát',
    'cam.byhand': 'Để tự tô màu',
    'cam.starting': 'Đang bật máy ảnh…',
    'cam.reading': 'Đang đọc màu… đưa cả mặt vào trong khung nhé.',
    'cam.holdstill': 'Đang đọc — giữ yên một chút…',
    'cam.show': 'Đưa một mặt của khối Rubik lên trước máy ảnh.',
    'cam.got': 'Xong rồi. Đặt khối Rubik xuống rồi bấm Nhận, hoặc đưa lên lại để đọc lại.',
    'cam.side.read': 'Đọc xong mặt {side} rồi ✓ Xoay sang mặt khác đi.',
    'cam.side.done': 'Mặt {side} đã đúng rồi. Xoay sang mặt khác đi.',
    'cam.got.one': 'Đọc xong rồi, nhưng có một ô chưa rõ — chọn màu rồi chạm vào ô xám đó.',
    'cam.got.many': 'Đọc xong rồi, nhưng có {n} ô chưa rõ — chọn màu rồi chạm vào các ô xám.',
    'cam.err.https': 'Trang này phải mở bằng https thì trình duyệt mới cho dùng máy ảnh. Ở đây bạn tự tô màu nhé.',
    'cam.err.frame': 'Trang xem thử này không được phép dùng máy ảnh — không ai chặn cả, chỉ là nó nằm trong một khung không bao giờ hỏi. Mở trang thật thì dùng được. Giờ thì bạn tự tô màu nhé.',
    'cam.err.none': 'Mình không tìm thấy máy ảnh nào trên máy này. Bạn tự tô màu nhé.',
    'cam.err.busy': 'Một ứng dụng khác đang dùng máy ảnh. Đóng nó rồi bấm lại, hoặc tự tô màu.',
    'cam.err.off': 'Máy ảnh đang bị tắt cho trang này. Chạm vào hình ổ khoá cạnh địa chỉ để bật lên, hoặc tự tô màu.',
    'cam.err.refused': 'Lần này chưa được dùng máy ảnh. Bấm nút máy ảnh để hỏi lại, hoặc tự tô màu.',
    'cam.err.other': 'Máy ảnh không bật được. Bạn tự tô màu nhé.',
    'cam.err.blank': 'Máy ảnh không gửi hình ra. Bạn tự tô màu nhé.',
    'cam.err.ours': 'Máy ảnh bật được nhưng trang này không dùng được hình. Bạn tự tô màu, và nhớ báo cho người làm ra trang này.',

    'net.title': 'Tự tô màu vào',
    'net.hint': 'Tô một mặt trước, rồi tới mặt kế. Ô giữa của mỗi mặt mình điền sẵn rồi.',
    'net.tap': 'Chạm vào ô nào cần sửa. Ô giữa của mỗi mặt quyết định màu của mặt đó.',
    'net.redo': 'Dùng máy ảnh lại',
    'net.start': 'Bắt đầu học ▶',
    'net.face.U': 'trên', 'net.face.L': 'trái', 'net.face.F': 'trước',
    'net.face.R': 'phải', 'net.face.B': 'sau', 'net.face.D': 'dưới',
    'net.err.centre': 'Thiếu một ô giữa',
    'net.err.centre.why': 'Mặt nào cũng phải có ô giữa, vì chính nó quyết định màu của mặt đó.',
    'net.err.same': 'Hai mặt có ô giữa cùng màu',
    'net.err.same.why': 'Khối Rubik có sáu ô giữa khác màu nhau. Xem lại những ô mình đọc là {colour}.',
    'net.err.unknown': 'Có một ô mình không biết màu gì',
    'net.err.unknown.why': 'Chạm vào ô xám rồi chọn màu cho nó.',
    'net.err.impossible': 'Khối Rubik như vậy không có thật',
    'net.err.impossible.why': '{hint} Sửa lại ô đó rồi bấm bắt đầu lần nữa. (Nếu ảnh bị lật ngược thì cột trái và cột phải sẽ đổi chỗ cho nhau.)',
    'net.err.stuck': 'Mình chưa giải được khối này',
    'net.err.stuck.why': 'Lỗi của mình chứ không phải của bạn. Xem lại màu một lượt rồi thử lại nhé.',

    'coach.step': 'Bước {n} trên 7 · nước {i} trên {of} · còn {left} nước nữa',
    'coach.progress': 'Bước {current} / {total}',
    'coach.steps': 'Các bước',
    'coach.resize': 'Kéo góc để đổi kích thước (hoặc dùng phím mũi tên)',
    'coach.target.cross': 'Tạo dấu cộng màu {base}',
    'coach.target.corners': 'Hoàn thành tầng màu {base}',
    'coach.target.belt': 'Hoàn thành tầng giữa',
    'coach.target.yellowCross': 'Tạo dấu cộng màu {top}',
    'coach.target.yellowFace': 'Hoàn thành mặt màu {top}',
    'coach.target.cornerPlace': 'Đưa các góc màu {top} về đúng chỗ',
    'coach.target.lastEdges': 'Đưa các cạnh cuối về đúng chỗ',
    'coach.undo': 'Quay về bước trước đó',
    'coach.next': 'Qua bước kế tiếp',
    'coach.letters': 'Hiện ký hiệu của người lớn',
    'coach.restart': 'Làm lại từ đầu',
    'coach.hold': 'Cứ cầm y như vậy suốt — đừng xoay cả khối Rubik.',
    'coach.chip.bottom': '{colour} ở dưới',
    'coach.chip.front': '{colour} phía trước',
    'coach.spin': 'Kéo khối Rubik để nhìn quanh nó',
    'coach.done.title': 'Xong rồi! 🎉',
    'coach.done.count': 'Vừa xoay {n} nước.',
    'coach.done.again': 'Xáo lên rồi làm lại lần nữa — lần sau là bạn nhớ được nước cá rồi đấy.',
    'coach.done.button': 'Giải khối khác',
    'coach.whole': 'Hết nước rồi. Làm lại nếu bạn cần.',

    'case.home': '{done} trên 4 {what} đã về chỗ.',
    'case.what.cross': 'ô cạnh của dấu cộng',
    'case.what.corners': 'ô góc dưới',
    'case.what.belt': 'ô vành giữa',
    'case.dot': 'Mặt trên của bạn chỉ có một chấm — phải làm ba lượt.',
    'case.line': 'Mặt trên của bạn đang là một vạch.',
    'case.L': 'Mặt trên của bạn đang là hình chữ L.',
    'case.cross': 'Dấu cộng có sẵn rồi.',
    'case.nearly': 'Mặt trên sắp thành dấu cộng rồi.',
    'case.corners': '{n} trên 4 ô góc trên đã có màu {colour}.',
    'case.sides': 'Mặt trên đã là màu {colour}. Giờ tới lượt các cạnh xếp cho thẳng hàng.',

    'move.U': 'Hàng trên xoay sang TRÁI', "move.U'": 'Hàng trên xoay sang PHẢI', 'move.U2': 'Hàng trên xoay nửa vòng',
    'move.D': 'Hàng dưới xoay sang PHẢI', "move.D'": 'Hàng dưới xoay sang TRÁI', 'move.D2': 'Hàng dưới xoay nửa vòng',
    'move.R': 'Cột phải đi LÊN', "move.R'": 'Cột phải đi XUỐNG', 'move.R2': 'Cột phải xoay nửa vòng',
    'move.L': 'Cột trái đi XUỐNG', "move.L'": 'Cột trái đi LÊN', 'move.L2': 'Cột trái xoay nửa vòng',
    'move.F': 'Mặt trước xoay theo chiều kim đồng hồ', "move.F'": 'Mặt trước xoay ngược chiều kim đồng hồ', 'move.F2': 'Mặt trước xoay nửa vòng',
    'move.B': 'Tầng sau: phía trên của nó đi sang TRÁI', "move.B'": 'Tầng sau: phía trên của nó đi sang PHẢI', 'move.B2': 'Tầng sau xoay nửa vòng',

    'stage.cross.short': '1 · Dấu cộng',
    'stage.cross.name': 'Làm dấu cộng trắng',
    'stage.cross.goal': 'Đặt bốn ô cạnh màu trắng quanh ô giữa trắng, ở mặt dưới. Mỗi ô còn phải trùng màu với mặt bên mà nó chạm vào.',
    'stage.corners.short': '2 · Góc',
    'stage.corners.name': 'Đưa các góc trắng về chỗ',
    'stage.corners.goal': 'Mỗi ô góc trắng chui xuống dưới đúng hai màu của nó. Xong bốn góc là cả tầng dưới hoàn thành.',
    'stage.belt.short': '3 · Vành giữa',
    'stage.belt.name': 'Lấp đầy vành giữa',
    'stage.belt.goal': 'Bốn ô cạnh trượt vào vành giữa. Xong hai tầng, còn một tầng nữa thôi.',
    'stage.yellowCross.short': '4 · Cộng vàng',
    'stage.yellowCross.name': 'Vẽ dấu cộng vàng',
    'stage.yellowCross.goal': 'Làm thành dấu cộng vàng ở mặt trên. Lúc này chỉ cần để ý mặt trên thôi.',
    'stage.yellowFace.short': '5 · Mặt vàng',
    'stage.yellowFace.name': 'Làm cả mặt trên thành vàng',
    'stage.yellowFace.goal': 'Nước cá xoay các ô góc cho tới khi cả mặt trên vàng hết. Dấu cộng vừa làm vẫn còn nguyên.',
    'stage.cornerPlace.short': '6 · Chỗ ngồi',
    'stage.cornerPlace.name': 'Cho các góc về đúng chỗ ngồi',
    'stage.cornerPlace.goal': 'Đảo các ô góc trên cho tới khi góc nào cũng nằm giữa đúng hai màu của nó. Màu vàng vẫn ở trên suốt.',
    'stage.lastEdges.short': '7 · Bốn cạnh',
    'stage.lastEdges.name': 'Đưa bốn cạnh cuối về chỗ',
    'stage.lastEdges.goal': 'Bốn ô cạnh cuối chạy vòng quanh cho tới khi mặt nào cũng một màu. Đây là bước cuối cùng.',

    'steps.title': 'Bảy bước',
    'steps.lede': 'Mỗi hình là một khối Rubik. Mũi tên cho biết tầng nào xoay và xoay về hướng nào. Làm lần lượt từng hình một.',
    'steps.tocoach': 'Muốn máy ảnh chỉ cho? 📷',
    'steps.letters': 'Hiện ký hiệu (R U R′)',
    'steps.watch': 'Bấm nút “Xem thử” bất kỳ là các nước xoay sẽ chạy ở đây.',
    'steps.play': '▶ Chạy', 'steps.step': 'Từng nước ▸', 'steps.reset': '↺ Về đầu',
    'steps.drag': 'Kéo khối Rubik để nhìn ra phía sau.',
    'steps.turns': '{n} nước — bấm Chạy hoặc Từng nước',
    'steps.done': 'Hết rồi — đó là cả nước xoay.',
    'steps.back': 'Về đầu rồi.',
    'steps.of': 'Bước {n} trên 7',
    'steps.watchthis': 'Xem thử ▶',
    'steps.finished': 'làm xong thì trông như vầy',
    'steps.donecap': 'xong ✓',
    'steps.twice': 'xoay hai lần',
    'steps.back.links': '← về lại trang liên kết',

    'steps.cross.note': 'Bước này không có nước phép nào — bạn tự đẩy các ô là ra. Chỉ cần hai nước xoay này thôi.',
    'steps.cross.petal': 'Thả một cánh hoa trắng xuống',
    'steps.cross.petal.note': 'Ô trắng đang ở mặt trên, ngay phía trên đúng màu của nó? Xoay cả mặt đó hai lần là nó rơi xuống chỗ.',
    'steps.cross.gap': 'Xoay chỗ trống ra trước',
    'steps.cross.gap.note': 'Xoay tầng dưới để đưa chỗ còn trống ra phía trước.',
    'steps.corners.note': 'Đưa ô góc lên tầng trên, ngay phía trên chỗ trống của nó, rồi chọn cách hợp với hướng mà ô trắng đang quay về.',
    'steps.corners.right': 'Ô trắng quay sang phải',
    'steps.corners.right.note': 'Ba nước là nó vào chỗ.',
    'steps.corners.front': 'Ô trắng quay về phía bạn',
    'steps.corners.front.note': 'Giống cách trên nhưng lật ngược lại.',
    'steps.corners.top': 'Ô trắng quay lên trên',
    'steps.corners.top.note': 'Đầu tiên nó bị đẩy ra, rồi quay vào đúng chiều.',
    'steps.belt.note': 'Tìm một ô cạnh ở tầng trên mà không có màu vàng. Xoay tầng trên cho màu phía trước của nó trùng với ô giữa trước mặt, rồi chọn bên.',
    'steps.belt.right': 'Đẩy sang phải',
    'steps.belt.right.note': 'Dùng khi ô cạnh phải vào chỗ bên phải.',
    'steps.belt.left': 'Đẩy sang trái',
    'steps.belt.left.note': 'Vẫn vậy nhưng lật ngược, dùng cho chỗ bên trái.',
    'steps.yellowCross.note': 'Nhìn mặt vàng rồi tìm hình của bạn ở dưới. Xoay tầng trên cho hình nằm giống trong tranh, rồi làm nước xoay.',
    'steps.yellowCross.cross': 'Nước làm dấu cộng',
    'steps.yellowCross.cross.note': 'Sáu nước. Đây là nước đáng thuộc lòng đầu tiên.',
    'steps.yellowFace.note': 'Đếm xem mấy ô góc đã vàng. Cầm khối Rubik như trong tranh, làm nước cá, rồi đếm lại — mỗi lần làm là nó đổi, cho tới khi cả bốn góc vàng hết.',
    'steps.yellowFace.fish': 'Nước cá',
    'steps.yellowFace.fish.note': 'Bảy nước. Để ý mà xem, nó chính là nước ở bước 2 thêm một chút.',
    'steps.yellowFace.back': 'Nước cá, chiều ngược',
    'steps.yellowFace.back.note': 'Dùng khi làm nước cá thường sẽ phải đi đường vòng.',
    'steps.cornerPlace.note': 'Nước này giữ yên một ô góc và cho ba ô còn lại chạy vòng quanh. Làm một lần, nhìn lại, rồi làm nữa nếu còn hai góc đổi chỗ cho nhau.',
    'steps.cornerPlace.circle': 'Vòng góc',
    'steps.cornerPlace.circle.note': 'Chín nước, và không đụng gì tới mấy tầng bạn đã làm xong.',
    'steps.cornerPlace.back': 'Vòng góc, chiều ngược',
    'steps.cornerPlace.back.note': 'Cũng vòng đó nhưng chạy ngược lại.',
    'steps.lastEdges.note': 'Thường sẽ có sẵn một mặt đã khớp. Cầm khối Rubik cho mặt đó ra sau, rồi ba ô cạnh kia chạy vòng quanh.',
    'steps.lastEdges.circle': 'Vòng cạnh',
    'steps.lastEdges.circle.note': 'Mười một nước. Làm từ từ — nó dài nhất, mà cũng là nước cuối.',
    'steps.lastEdges.back': 'Vòng cạnh, chiều ngược',
    'steps.lastEdges.back.note': 'Dùng khi ba ô cạnh cần chạy theo chiều ngược lại.',

    'shape.dot': 'Chỉ một chấm', 'shape.dot.tell': 'Làm nước đó ba lần.',
    'shape.L': 'Hình chữ L', 'shape.L.tell': 'Quay chữ L hướng về góc trên bên trái, rồi làm hai lần.',
    'shape.line': 'Một vạch thẳng', 'shape.line.tell': 'Đặt vạch nằm ngang, trái sang phải, rồi làm một lần.',
    'shape.one': 'Một góc vàng', 'shape.one.tell': 'Đưa góc đó ra phía trước bên trái, rồi làm nước cá một lần.',
    'shape.none': 'Không góc nào vàng', 'shape.none.tell': 'Làm nước cá từ hướng nào cũng được. Xong sẽ ra một trong các hình kia.',
    'shape.two': 'Hai góc vàng', 'shape.two.tell': 'Làm nước cá một lần rồi nhìn lại.'
  };

  var EN = {
    'lang.other': 'Tiếng Việt',

    'colour.white': 'white', 'colour.yellow': 'yellow', 'colour.green': 'green',
    'colour.blue': 'blue', 'colour.red': 'red', 'colour.orange': 'orange',
    'side.U': 'top', 'side.D': 'bottom', 'side.F': 'front',
    'side.R': 'right', 'side.L': 'left', 'side.B': 'back',

    'start.title': 'Cube Coach',
    'start.lede': 'Show me your cube and I will tell you one turn at a time, until it is solved. No letters to learn.',
    'start.step1': 'Show all six sides to the camera.',
    'start.step2': 'Check the colours I read — tap any sticker I get wrong.',
    'start.step3': 'Follow the turns. One turn, one button.',
    'start.camera': 'Show me your cube 📷',
    'start.steps': 'Just show me the steps 📖',
    'start.demo': 'Try a practice cube 🎲',
    'start.manual': 'No camera? Tap the colours in instead',
    'start.privacy': 'Works best in good light. The camera picture never leaves this page — nothing is uploaded.',

    'cap.tool': 'Auto colour using camera',
    'cap.solve': 'Solve it ▶',
    'cap.clear': 'Clear all colours',
    'cap.kept.all': 'This is the cube you read last time. Press Solve it, or read a side again to change it.',
    'cap.kept.some': '{n} sides are still here from last time.',
    'cap.missing': 'Fill in the grey stickers on this side.',

    'cam.title': 'Hold the glowing side up to the camera',
    'cam.title.trouble': 'No camera here',
    'cam.accept': 'Accept ✓',
    'cam.cancel': 'Cancel',
    'cam.byhand': 'Paint by hand',
    'cam.starting': 'Starting the camera…',
    'cam.reading': 'Reading the colours… line the side up in the square.',
    'cam.holdstill': 'Reading it — hold still…',
    'cam.show': 'Hold a side of the cube up to the camera.',
    'cam.got': 'Got it. Put the cube down and press Accept, or hold it up again to read it afresh.',
    'cam.side.read': 'Read the {side} side ✓ Spin to another one.',
    'cam.side.done': 'The {side} side already matches. Spin to another one.',
    'cam.got.one': 'Got it, but one square was not clear — tap a colour onto the grey one.',
    'cam.got.many': 'Got it, but {n} squares were not clear — tap colours onto the grey ones.',
    'cam.err.https': 'This page needs to be opened over https before a browser will hand it the camera. Paint the colours in by hand here.',
    'cam.err.frame': 'This preview page is not allowed to use the camera — nobody blocked it, the page is inside a frame that never asks. It works on the real page. For now, paint the colours in by hand.',
    'cam.err.none': 'I cannot find a camera on this device. Paint the colours in by hand instead.',
    'cam.err.busy': 'Another app is using the camera. Close it and tap the camera again, or paint by hand.',
    'cam.err.off': 'The camera is turned off for this page. Tap the padlock next to the address to allow it, or paint the colours in by hand.',
    'cam.err.refused': 'No camera this time. Tap the camera button to ask again, or paint the colours in by hand.',
    'cam.err.other': 'The camera did not start. Paint the colours in by hand instead.',
    'cam.err.blank': 'No picture is coming through. Paint the colours in by hand instead.',
    'cam.err.ours': 'The camera started but this page could not use the picture. Paint the colours in by hand, and tell whoever made this page.',

    'net.title': 'Tap in the colours',
    'net.hint': 'Start with one side, then the next. The middle sticker of each side is already filled in.',
    'net.tap': 'Tap any sticker to fix it. The middle sticker of each side decides that side’s colour.',
    'net.redo': 'Use the camera again',
    'net.start': 'Start the lesson ▶',
    'net.face.U': 'top', 'net.face.L': 'left', 'net.face.F': 'front',
    'net.face.R': 'right', 'net.face.B': 'back', 'net.face.D': 'bottom',
    'net.err.centre': 'A middle sticker is missing',
    'net.err.centre.why': 'Every side needs its middle sticker, because that is what decides the colour of that side.',
    'net.err.same': 'Two sides have the same middle colour',
    'net.err.same.why': 'A cube has six different middle stickers. Check the ones I read as {colour}.',
    'net.err.unknown': 'One sticker is a colour I do not know',
    'net.err.unknown.why': 'Tap the grey sticker and give it a colour.',
    'net.err.impossible': 'That cube cannot exist',
    'net.err.impossible.why': '{hint} Fix the sticker and press start again. (If the picture came out mirrored, the left and right columns get swapped.)',
    'net.err.stuck': 'I could not work that one out',
    'net.err.stuck.why': 'That is my fault, not yours. Check the colours once more and try again.',

    'coach.step': 'Step {n} of 7 · turn {i} of {of} · {left} turns left in all',
    'coach.progress': 'Step {current} / {total}',
    'coach.steps': 'Steps',
    'coach.resize': 'Drag the corner to resize (or use the arrow keys)',
    'coach.target.cross': 'Make the {base} cross',
    'coach.target.corners': 'Finish the {base} layer',
    'coach.target.belt': 'Complete the middle layer',
    'coach.target.yellowCross': 'Make the {top} cross',
    'coach.target.yellowFace': 'Finish the {top} face',
    'coach.target.cornerPlace': 'Put the {top} corners in place',
    'coach.target.lastEdges': 'Match the last edges',
    'coach.undo': 'Previous step',
    'coach.next': 'Next step',
    'coach.letters': 'Show the grown-up letters',
    'coach.restart': 'Start over',
    'coach.hold': 'Hold it this way the whole time — never turn the whole cube.',
    'coach.chip.bottom': '{colour} bottom',
    'coach.chip.front': '{colour} front',
    'coach.spin': 'Drag the cube to look around it',
    'coach.done.title': 'Solved! 🎉',
    'coach.done.count': 'That was {n} turns.',
    'coach.done.again': 'Scramble it and do it again — next time you will remember the fish move.',
    'coach.done.button': 'Solve another one',
    'coach.whole': 'That is the whole move. Do it again if you need to.',

    'case.home': '{done} of 4 {what} are already home.',
    'case.what.cross': 'cross pieces',
    'case.what.corners': 'bottom corners',
    'case.what.belt': 'belt pieces',
    'case.dot': 'Your top is a dot — it will take three goes.',
    'case.line': 'Your top has a line.',
    'case.L': 'Your top has an L.',
    'case.cross': 'The cross is already there.',
    'case.nearly': 'Your top is nearly a cross.',
    'case.corners': '{n} of the 4 top corners show {colour} so far.',
    'case.sides': 'The top is {colour}. Now the sides have to line up.',

    'move.U': 'Top row goes LEFT', "move.U'": 'Top row goes RIGHT', 'move.U2': 'Top row: half turn',
    'move.D': 'Bottom row goes RIGHT', "move.D'": 'Bottom row goes LEFT', 'move.D2': 'Bottom row: half turn',
    'move.R': 'Right side goes UP', "move.R'": 'Right side goes DOWN', 'move.R2': 'Right side: half turn',
    'move.L': 'Left side goes DOWN', "move.L'": 'Left side goes UP', 'move.L2': 'Left side: half turn',
    'move.F': 'Front face spins RIGHT', "move.F'": 'Front face spins LEFT', 'move.F2': 'Front face: half turn',
    'move.B': 'Back layer: its top goes LEFT', "move.B'": 'Back layer: its top goes RIGHT', 'move.B2': 'Back layer: half turn',

    'stage.cross.short': '1 · Cross',
    'stage.cross.name': 'Make the white cross',
    'stage.cross.goal': 'Put the four white edge pieces around the white middle, on the bottom. Each one also has to match the colour of its side.',
    'stage.corners.short': '2 · Corners',
    'stage.corners.name': 'Lock in the white corners',
    'stage.corners.goal': 'Each white corner goes under its own two colours. Now the whole bottom layer is finished.',
    'stage.belt.short': '3 · Belt',
    'stage.belt.name': 'Fill the middle belt',
    'stage.belt.goal': 'Four edge pieces slide into the middle ring. Two layers done, one to go.',
    'stage.yellowCross.short': '4 · Yellow +',
    'stage.yellowCross.name': 'Draw the yellow cross',
    'stage.yellowCross.goal': 'Make a yellow plus sign on the top. Only the top face matters here.',
    'stage.yellowFace.short': '5 · Yellow top',
    'stage.yellowFace.name': 'Make the whole top yellow',
    'stage.yellowFace.goal': 'The fish move twists the corners until the whole top side is yellow. The cross you just made stays.',
    'stage.cornerPlace.short': '6 · Seats',
    'stage.cornerPlace.name': 'Give the corners their seats',
    'stage.cornerPlace.goal': 'Shuffle the top corners until each one sits between its own two colours. The yellow stays on top the whole time.',
    'stage.lastEdges.short': '7 · Last four',
    'stage.lastEdges.name': 'Slide the last edges home',
    'stage.lastEdges.goal': 'The last four edges go round until every side of the cube is one colour. This is the finish.',

    'steps.title': 'The seven steps',
    'steps.lede': 'Every picture is a cube. The arrow shows the layer that turns and which way it goes. Work down a row, one picture at a time.',
    'steps.tocoach': 'Rather have the camera guide me? 📷',
    'steps.letters': 'Show the letters (R U R′)',
    'steps.watch': 'Pick any “Watch this” button and the moves play here.',
    'steps.play': '▶ Play', 'steps.step': 'Step ▸', 'steps.reset': '↺ Reset',
    'steps.drag': 'Drag the cube to look round the back.',
    'steps.turns': '{n} turns — press Play or Step',
    'steps.done': 'Done — that is the whole move.',
    'steps.back': 'Back to the start.',
    'steps.of': 'Step {n} of 7',
    'steps.watchthis': 'Watch this ▶',
    'steps.finished': 'what finished looks like',
    'steps.donecap': 'done ✓',
    'steps.twice': 'turn it twice',
    'steps.back.links': '← back to the links',

    'steps.cross.note': 'This step has no magic move — you can work it out by pushing pieces about. These two turns are all you need.',
    'steps.cross.petal': 'Drop a white petal',
    'steps.cross.petal.note': 'White sticker on the top, sitting above its own colour? Spin that whole side twice and it drops into place.',
    'steps.cross.gap': 'Bring the gap round',
    'steps.cross.gap.note': 'Turn the bottom layer to move an empty slot to the front.',
    'steps.corners.note': 'Put the corner in the top layer, right above the gap it belongs in, then use the recipe that matches where its white sticker points.',
    'steps.corners.right': 'White points right',
    'steps.corners.right.note': 'Three turns and it drops in.',
    'steps.corners.front': 'White points at you',
    'steps.corners.front.note': 'The mirror of the one above.',
    'steps.corners.top': 'White points up',
    'steps.corners.top.note': 'First it gets kicked out, then it comes back in the right way round.',
    'steps.belt.note': 'Find an edge in the top layer with no yellow on it. Turn the top until its front colour matches the middle in front of it, then pick a side.',
    'steps.belt.right': 'Send it right',
    'steps.belt.right.note': 'For an edge that has to go into the slot on the right.',
    'steps.belt.left': 'Send it left',
    'steps.belt.left.note': 'Same thing, mirrored, for the slot on the left.',
    'steps.yellowCross.note': 'Look at the yellow side and find your shape below. Turn the top until your shape sits the same way as the picture, then do the move.',
    'steps.yellowCross.cross': 'The cross move',
    'steps.yellowCross.cross.note': 'Six turns. This is the one to learn by heart first.',
    'steps.yellowFace.note': 'Count the yellow corners on top. Hold the cube as the picture says, do the fish move, then count again — it changes every time until all four are up.',
    'steps.yellowFace.fish': 'The fish move',
    'steps.yellowFace.fish.note': 'Seven turns. Notice it is the corner move from step 2 with a bit extra.',
    'steps.yellowFace.back': 'The fish, backwards',
    'steps.yellowFace.back.note': 'Useful when the fish move would take you the long way round.',
    'steps.cornerPlace.note': 'This move keeps one corner still and sends the other three round in a circle. Do it once, look, and do it again if two corners are still swapped.',
    'steps.cornerPlace.circle': 'Corner circle',
    'steps.cornerPlace.circle.note': 'Nine turns, and it never touches the layers you already finished.',
    'steps.cornerPlace.back': 'Corner circle, the other way',
    'steps.cornerPlace.back.note': 'The same circle, going backwards.',
    'steps.lastEdges.note': 'One side will usually already match. Hold the cube with that side at the back, and the other three edges go round.',
    'steps.lastEdges.circle': 'Edge circle',
    'steps.lastEdges.circle.note': 'Eleven turns. Go slowly — it is the longest one, and the last.',
    'steps.lastEdges.back': 'Edge circle, the other way',
    'steps.lastEdges.back.note': 'When the three edges need to go round the other way.',

    'shape.dot': 'Just a dot', 'shape.dot.tell': 'Do the move three times.',
    'shape.L': 'An L', 'shape.L.tell': 'Point the L at the top-left corner, then do it twice.',
    'shape.line': 'A line', 'shape.line.tell': 'Lay the line flat, left to right, then do it once.',
    'shape.one': 'One corner yellow', 'shape.one.tell': 'Put that corner at the front-left, then do the fish move once.',
    'shape.none': 'No corner yellow', 'shape.none.tell': 'Do the fish move from any angle. You will land on one of the other shapes.',
    'shape.two': 'Two corners yellow', 'shape.two.tell': 'Do the fish move once, then look again.'
  };

  var DICT = { vi: VI, en: EN };
  var STORE = 'cube-coach/lang';
  var current = 'vi';
  try {
    var saved = localStorage.getItem(STORE);
    if (saved && DICT[saved]) current = saved;
  } catch (e) { /* storage turned off */ }

  /** Look a phrase up, filling in {placeholders}. */
  function t(key, vars) {
    var text = (DICT[current] && DICT[current][key]) || DICT.en[key] || key;
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (whole, name) {
      return vars[name] == null ? whole : vars[name];
    });
  }
  function colour(name) { return t('colour.' + name); }
  function side(face) { return t('side.' + face); }

  function apply(root) {
    (root || document).querySelectorAll('[data-t]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-t'));
    });
    document.documentElement.lang = current;
  }
  var listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function set(lang) {
    if (!DICT[lang] || lang === current) return;
    current = lang;
    try { localStorage.setItem(STORE, lang); } catch (e) { /* storage turned off */ }
    apply(document);
    listeners.forEach(function (fn) { fn(current); });
  }

  return {
    t: t, colour: colour, side: side, apply: apply, set: set, onChange: onChange,
    get: function () { return current; },
    toggle: function () { set(current === 'vi' ? 'en' : 'vi'); }
  };
});
