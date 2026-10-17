export const accounts:Record<string,any>={
 daily01:{name:'Đại lý Ductuan',role:'agency',organization:'Ductuan Shipping Agency',station:'Vũng Tàu',accountCode:'DL-01'},
 dieudo01:{name:'Điều độ Vũng Tàu',role:'dispatch',organization:'Vungtau Pilot',station:'Trung tâm điều độ Vũng Tàu',accountCode:'DD-01'},
 'hoatieu.a':{name:'Nguyễn Văn An',role:'pilot',pilotGrade:'Hạng Nhất',pilotNumber:'HT-001',organization:'Vungtau Pilot',station:'Trạm hoa tiêu Vũng Tàu',device:'P-07'},
 'hoatieu.b':{name:'Trần Minh Bình',role:'pilot',pilotGrade:'Hạng Nhì',pilotNumber:'HT-002',organization:'Vungtau Pilot',station:'Trạm hoa tiêu Vũng Tàu',device:'P-08'},
 'hoatieu.c':{name:'Lê Quốc Huy',role:'pilot',pilotGrade:'Hạng Ba',pilotNumber:'HT-003',organization:'Vungtau Pilot',station:'Trạm hoa tiêu Vũng Tàu',device:'P-09'},
 'hoatieu.d':{name:'Nguyễn Quyết Thắng',role:'pilot',pilotGrade:'Ngoại hạng',pilotNumber:'HT-004',organization:'Vungtau Pilot',station:'Trạm hoa tiêu Vũng Tàu',device:'P-10'},
 'hoatieu.e':{name:'Trần Văn Bảo',role:'pilot',pilotGrade:'Hạng Nhì',pilotNumber:'HT-005',organization:'Vungtau Pilot',station:'Trạm hoa tiêu Vũng Tàu',device:'P-11'},
 'hoatieu.f':{name:'Lê Minh Quân',role:'pilot',pilotGrade:'Hạng Nhất',pilotNumber:'HT-006',organization:'Vungtau Pilot',station:'Trạm hoa tiêu Vũng Tàu',device:'P-12'},
 'hoatieu.g':{name:'Phạm Thị Hoa',role:'pilot',pilotGrade:'Hạng Nhì',pilotNumber:'HT-007',organization:'Vungtau Pilot',station:'Trạm hoa tiêu Vũng Tàu',device:'P-13'},
 'hoatieu.h':{name:'Hoàng Văn Đức',role:'pilot',pilotGrade:'Hạng Nhất',pilotNumber:'HT-008',organization:'Vungtau Pilot',station:'Trạm hoa tiêu Vũng Tàu',device:'P-14'},
 'hoatieu.i':{name:'Vũ Thị Lan',role:'pilot',pilotGrade:'Hạng Ba',pilotNumber:'HT-009',organization:'Vungtau Pilot',station:'Trạm hoa tiêu Vũng Tàu',device:'P-15'},
 'hoatieu.j':{name:'Đỗ Xuân Tùng',role:'pilot',pilotGrade:'Hạng Nhì',pilotNumber:'HT-010',organization:'Vungtau Pilot',station:'Trạm hoa tiêu Vũng Tàu',device:'P-16'},
 'hoatieu.k':{name:'Ngô Bảo Long',role:'pilot',pilotGrade:'Hạng Nhất',pilotNumber:'HT-011',organization:'Vungtau Pilot',station:'Trạm hoa tiêu Vũng Tàu',device:'P-17'},
 'hoatieu.l':{name:'Bùi Thanh Sơn',role:'pilot',pilotGrade:'Hạng Ba',pilotNumber:'HT-012',organization:'Vungtau Pilot',station:'Trạm hoa tiêu Vũng Tàu',device:'P-18'}
};

// Explicit scenario data, not statutory grade limits. Replace with verified certificates.
export function pilotEligibility(trip:any,id:string,assignment=false){
 const a=accounts[id];if(!a||a.role!=='pilot')return 'Không phải hoa tiêu';
 const limits:Record<string,[number,number]>={'Ngoại hạng':[500,250000],'Hạng Nhất':[300,100000],'Hạng Nhì':[200,50000],'Hạng Ba':[150,20000]};
 const [loa,gt]=limits[a.pilotGrade]||[0,0],shipGt=Number(trip.order?.gt||trip.gt);
 if(!(Number(trip.loa)>0)||!(shipGt>0))return 'Thiếu LOA / GT để đối chiếu';
 if(Number(trip.loa)>loa||shipGt>gt)return Number(trip.loa)>loa?'LOA '+trip.loa+' m vượt giới hạn '+loa+' m':'GT '+shipGt.toLocaleString('vi-VN')+' vượt giới hạn '+gt.toLocaleString('vi-VN');
 return '';
}
