/* quick.js
   test durability
   this file should always run quickly
   other tests can be slow
*/

print("a_quick.js");

// directories
var path1 = "/data/db/quicknodur";
var path2 = "/data/db/quickdur";

function runDiff(a, b) {
    function reSlash(s) {
        var x = s;
        if (_isWindows()) {
            while (1) {
                var y = x.replace('/', '\\');
                if (y == x)
                    break;
                x = y;
            }
        }
        return x;
    }
    a = reSlash(a);
    b = reSlash(b);
    print("diff " + a + " " + b);
    return run("diff", a, b);
}

var step = 1;
function log(str) {
    if(str)
        print("\n\nstep " + step++ + " " + str);
    else
        print("\n\nstep " + step++);
}

//stopMongo(30000, 9);

// non-durable version
log("start mongod without dur");
var conn = startMongodEmpty("--port", 30000, "--dbpath", path1, "--nodur");
log("without dur work");
var d = conn.getDB("test");
d.foo.insert({ _id:123 });
d.getLastError();
log("stop without dur");
stopMongod(30000);

// durable version
log("start mongod with dur");
var conn = startMongodEmpty("--port", 30001, "--dbpath", path2, "--dur", "--durOptions", 8);
log("with dur work");
var d = conn.getDB("test");
d.foo.insert({ _id: 123 });
d.getLastError(); // wait

// we could actually do getlasterror fsync:1 now, but maybe this is agood 
// as it will assure that commits happen on a timely basis.  a bunch of the other dur/*js
// tests use fsync
log("sleep a bit for a group commit");
sleep(500);

// kill the process hard
log("kill -9 mongod");
stopMongod(30001, /*signal*/9);

// journal file should be present, and non-empty as we killed hard

// we will force removal of a datafile to be sure we can recreate everythign
// without it being present.
removeFile(path2 + "/test.0");

// with the file deleted, we MUST start from the beginning of the journal.
// thus this check to be careful
var files = listFiles(path2 + "/journal/");
if (files.some(function (f) { return f.name.indexOf("lsn") >= 0; })) {
    print("\n\n\n");
    print(path2);
    printjson(files);
    assert(false, "a journal/lsn file is present which will make this test potentially fail.");
}

// restart and recover
log("restart and recover");
var conn = startMongodNoReset("--port", 30002, "--dbpath", path2, "--dur", "--durOptions", 8);
log("check data results");
var d = conn.getDB("test");
print("count:" + d.foo.count());
assert(d.foo.count() == 1, "count 1");

log("stop");
stopMongod(30002);

// stopMongod is asynchronous unfortunately.  wait some.
sleep(2000);

// at this point, after clean shutdown, there should be no journal files
log("check no journal files");
var jfiles = listFiles(path2 + "/journal");
if (jfiles.length) {
    print("sleeping more waiting for mongod to stop");
    sleep(10000);
    jfiles = listFiles(path2 + "/journal");

    if (jfiles.length) {
        print("ERROR journal dir " + path2 + "/journal is not empty:");
        printjson(jfiles);
        print("\n\n");  
        assert(jfiles.length == 0, "journal dir not empty");
    }
}

log("check data matches");
var diff = runDiff(path1 + "/test.ns", path2 + "/test.ns");
print("diff of .ns files returns:" + diff);

function showfiles() {
    print("\n\nERROR: files for dur and nodur do not match");
    print(path1 + " files:");
    printjson(listFiles(path1));
    print(path2 + " files:");
    printjson(listFiles(path2));
    print();
}

if (diff != "") {
    showfiles();    
    assert(diff == "", "error test.ns files differ");
}

var diff = runDiff(path1 + "/test.0", path2 + "/test.0");
print("diff of .0 files returns:" + diff);
if (diff != "") {
    showfiles();
    assert(diff == "", "error test.0 files differ");
}
    
print("quick.js SUCCESS");
